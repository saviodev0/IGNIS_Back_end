import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';

import { Chat, ChatDocument } from './schemas/chat.schema';
import { ChatMessage } from './schemas/message.schema';
import { ChatFile } from './schemas/chat-file.schema';
import { FileTextService } from './file-text.service';
import { GroqService, LlmMessage } from './groq.service';
import { StudentContextService } from './student-context.service';
import { IntentRouterService } from './intent-router.service';
import { DirectAnswerService } from './direct-answer.service';

// Controle de custo da IA
const HISTORY_WINDOW = 10; // últimas mensagens enviadas na íntegra
const SUMMARY_BATCH = 10; // resume quando houver ao menos N msgs fora da janela
const DAILY_MESSAGE_LIMIT = 100; // mensagens do aluno por dia
const MAX_FILES_PER_CHAT = 5;
const CONTEXT_CHUNKS = 4; // trechos de arquivo enviados por pergunta

const STOPWORDS = new Set([
  'para', 'como', 'qual', 'quais', 'sobre', 'isso', 'esse', 'essa', 'este', 'esta',
  'mais', 'muito', 'pode', 'poderia', 'quero', 'fazer', 'esse', 'seria', 'onde',
  'quando', 'porque', 'entre', 'tambem', 'ainda', 'sobre', 'preciso', 'dele', 'dela',
]);

function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .match(/[a-z0-9]{4,}/g) ?? []
  ).filter((word) => !STOPWORDS.has(word));
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(Chat.name) private readonly chats: Model<Chat>,
    @InjectModel(ChatMessage.name) private readonly messages: Model<ChatMessage>,
    @InjectModel(ChatFile.name) private readonly files: Model<ChatFile>,
    private readonly fileText: FileTextService,
    private readonly groq: GroqService,
    private readonly studentContext: StudentContextService,
    private readonly intentRouter: IntentRouterService,
    private readonly directAnswer: DirectAnswerService,
  ) {}

  // =========================
  // CHATS
  // =========================

  private async getOwned(userId: string, chatId: string): Promise<ChatDocument> {
    if (!isValidObjectId(chatId)) {
      throw new NotFoundException('Chat não encontrado');
    }

    const chat = await this.chats.findOne({ _id: chatId, userId });

    if (!chat) {
      throw new NotFoundException('Chat não encontrado');
    }

    return chat;
  }

  create(userId: string, title?: string) {
    return this.chats.create({ userId, title: title?.trim() || 'Novo chat' });
  }

  list(userId: string) {
    return this.chats
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(100)
      .select('title studyMinutes createdAt updatedAt')
      .lean();
  }

  async get(userId: string, chatId: string) {
    const chat = await this.getOwned(userId, chatId);

    const [messages, files] = await Promise.all([
      this.messages
        .find({ chatId: chat._id })
        .sort({ createdAt: 1, _id: 1 })
        .select('role content createdAt')
        .lean(),
      this.files.find({ chatId: chat._id }).select('name size charCount createdAt').lean(),
    ]);

    return {
      id: chat._id,
      title: chat.title,
      studyMinutes: chat.studyMinutes,
      messages,
      files,
    };
  }

  async remove(userId: string, chatId: string) {
    const chat = await this.getOwned(userId, chatId);

    await Promise.all([
      this.messages.deleteMany({ chatId: chat._id }),
      this.files.deleteMany({ chatId: chat._id }),
      chat.deleteOne(),
    ]);

    return { message: 'Chat excluído com sucesso.' };
  }

  async addStudyTime(userId: string, chatId: string, minutes: number) {
    const chat = await this.getOwned(userId, chatId);

    chat.studyMinutes += minutes;
    await chat.save();

    return { studyMinutes: chat.studyMinutes };
  }

  // =========================
  // ARQUIVOS
  // =========================

  async addFile(userId: string, chatId: string, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Envie um arquivo no campo "file".');
    }

    const chat = await this.getOwned(userId, chatId);

    if ((await this.files.countDocuments({ chatId: chat._id })) >= MAX_FILES_PER_CHAT) {
      throw new BadRequestException(`Máximo de ${MAX_FILES_PER_CHAT} arquivos por chat.`);
    }

    const text = await this.fileText.extract(file);
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const saved = await this.files.create({
      chatId: chat._id,
      userId,
      name,
      size: file.size,
      charCount: text.length,
      chunks: this.fileText.split(text),
    });

    return { id: saved._id, name, size: file.size, charCount: text.length };
  }

  /** Escolhe os trechos dos arquivos mais relacionados à pergunta. */
  private async relevantChunks(chatId: ChatDocument['_id'], question: string) {
    const files = await this.files.find({ chatId }).lean();
    const all = files.flatMap((file) => file.chunks.map((text) => ({ file: file.name, text })));

    if (all.length === 0) return [];

    const terms = [...new Set(tokenize(question))];

    const scored = all
      .map((chunk, index) => {
        const haystack = tokenize(chunk.text);
        const score = terms.reduce(
          (total, term) => total + haystack.filter((word) => word === term).length,
          0,
        );
        return { ...chunk, score, index };
      })
      .filter((chunk) => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, CONTEXT_CHUNKS)
      .sort((a, b) => a.index - b.index);

    // Pergunta genérica ("resuma o arquivo"): usa o começo do material
    return scored.length > 0 ? scored : all.slice(0, CONTEXT_CHUNKS);
  }

  // =========================
  // MENSAGENS (STREAMING)
  // =========================

  /**
   * Salva a mensagem do aluno, chama a IA e devolve os pedaços da resposta.
   * A resposta completa é salva no Mongo ao final (ou parcial, se o aluno cancelar).
   */
  async *sendMessage(
    userId: string,
    chatId: string,
    content: string,
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const chat = await this.getOwned(userId, chatId);

    // Perguntas sobre os próprios números do aluno: responde direto do banco, sem IA
    const intents = this.intentRouter.detect(content);

    if (intents) {
      const answer = await this.directAnswer.answer(userId, intents).catch((error) => {
        this.logger.warn(`Resposta direta falhou, usando a IA: ${error.message}`);
        return null;
      });

      if (answer) {
        await this.messages.create({ chatId: chat._id, userId, role: 'user', content, direct: true });
        await this.messages.create({
          chatId: chat._id,
          userId,
          role: 'assistant',
          content: answer,
          direct: true,
        });

        if (chat.title === 'Novo chat') {
          chat.title = content.replace(/\s+/g, ' ').slice(0, 50);
        }
        await chat.save();

        yield answer;
        return;
      }
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sentToday = await this.messages.countDocuments({
      userId,
      role: 'user',
      direct: { $ne: true },
      createdAt: { $gte: startOfDay },
    });

    if (sentToday >= DAILY_MESSAGE_LIMIT) {
      throw new HttpException(
        'Limite diário de mensagens atingido. Volte amanhã!',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const previous = await this.messages
      .find({ chatId: chat._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(HISTORY_WINDOW)
      .select('role content')
      .lean();
    previous.reverse();

    const [studentInfo, chunks] = await Promise.all([
      this.studentContext.build(userId, chat.studyMinutes),
      this.relevantChunks(chat._id, content),
    ]);

    const userMessage = await this.messages.create({
      chatId: chat._id,
      userId,
      role: 'user',
      content,
    });

    if (chat.title === 'Novo chat') {
      chat.title = content.replace(/\s+/g, ' ').slice(0, 50);
    }

    const llmMessages: LlmMessage[] = [
      { role: 'system', content: this.systemPrompt(studentInfo, chat.summary, chunks) },
      ...previous.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ];

    let answer = '';

    try {
      for await (const piece of this.groq.stream(llmMessages, signal)) {
        answer += piece;
        yield piece;
      }
    } finally {
      if (answer) {
        await this.messages.create({ chatId: chat._id, userId, role: 'assistant', content: answer });
      } else {
        // Sem resposta (erro da IA/cancelado): descarta a pergunta para o aluno poder reenviar
        await userMessage.deleteOne();
      }

      await chat.save();

      this.summarizeIfNeeded(chat._id.toString()).catch((error) =>
        this.logger.warn(`Falha ao resumir chat ${chat._id}: ${error.message}`),
      );
    }
  }

  private systemPrompt(
    studentInfo: string,
    summary: string,
    chunks: { file: string; text: string }[],
  ): string {
    const parts = [
      'Você é o assistente de estudos do IGNIS, um app de ciclos de estudo (pomodoro) com pontos, metas e sequências.',
      'Responda sempre em português do Brasil, de forma clara, didática e motivadora, sem enrolação.',
      'Use os dados do aluno quando ajudar (ex.: sugerir ciclos, comentar a sequência ou metas), sem inventar números.',
      `\n## Dados do aluno\n${studentInfo}`,
    ];

    if (summary) {
      parts.push(`\n## Resumo da conversa até aqui\n${summary}`);
    }

    if (chunks.length > 0) {
      parts.push(
        '\n## Trechos do material enviado pelo aluno\n' +
          'Priorize estes trechos quando a pergunta for sobre o material; se a resposta não estiver neles, avise e complemente com seu conhecimento geral.\n' +
          chunks.map((chunk) => `[${chunk.file}]\n${chunk.text}`).join('\n---\n'),
      );
    }

    return parts.join('\n');
  }

  /** Mantém o custo baixo: mensagens fora da janela viram um resumo curto. */
  private async summarizeIfNeeded(chatId: string) {
    const chat = await this.chats.findById(chatId);
    if (!chat) return;

    const total = await this.messages.countDocuments({ chatId: chat._id });
    const windowStart = total - HISTORY_WINDOW;

    if (windowStart - chat.summarizedCount < SUMMARY_BATCH) return;

    const old = await this.messages
      .find({ chatId: chat._id })
      .sort({ createdAt: 1, _id: 1 })
      .skip(chat.summarizedCount)
      .limit(windowStart - chat.summarizedCount)
      .select('role content')
      .lean();

    const transcript = old
      .map((m) => `${m.role === 'user' ? 'Aluno' : 'Assistente'}: ${m.content}`)
      .join('\n');

    const summary = await this.groq.complete([
      {
        role: 'system',
        content:
          'Resuma a conversa de estudos abaixo em português, em no máximo 150 palavras, mantendo temas, dúvidas e conclusões importantes.',
      },
      {
        role: 'user',
        content: `${chat.summary ? `Resumo anterior:\n${chat.summary}\n\n` : ''}Novas mensagens:\n${transcript}`,
      },
    ]);

    if (!summary) return;

    chat.summary = summary;
    chat.summarizedCount = windowStart;
    await chat.save();
  }
}
