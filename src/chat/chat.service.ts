import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';

import { Chat, ChatDocument } from './schemas/chat.schema';
import { ChatMessage } from './schemas/message.schema';
import { ChatFile } from './schemas/chat-file.schema';
import { rankChunks } from './chunk-ranker';
import { FileTextService } from './file-text.service';
import { FileStorageService } from './file-storage.service';
import { GroqService, LlmMessage } from './groq.service';
import { StudentContextService, formatMinutes } from './student-context.service';
import { IntentRouterService } from './intent-router.service';
import { DirectAnswerService } from './direct-answer.service';

// Controle de custo da IA
const HISTORY_WINDOW = 10; // últimas mensagens enviadas na íntegra
const SUMMARY_BATCH = 10; // resume quando houver ao menos N msgs fora da janela
const DAILY_MESSAGE_LIMIT = 100; // mensagens do aluno por dia
const MAX_FILES_PER_CHAT = 5;
const CONTEXT_CHUNKS = 4; // trechos de arquivo enviados por pergunta

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(Chat.name) private readonly chats: Model<Chat>,
    @InjectModel(ChatMessage.name) private readonly messages: Model<ChatMessage>,
    @InjectModel(ChatFile.name) private readonly files: Model<ChatFile>,
    private readonly fileText: FileTextService,
    private readonly storage: FileStorageService,
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
      this.files.find({ chatId: chat._id }).select('name size charCount createdAt storedAs').lean(),
    ]);

    return {
      id: chat._id,
      title: chat.title,
      studyMinutes: chat.studyMinutes,
      messages,
      files: files.map(({ storedAs, ...file }) => ({ ...file, hasOriginal: !!storedAs })),
    };
  }

  async rename(userId: string, chatId: string, title: string) {
    const chat = await this.getOwned(userId, chatId);
    const clean = title.replace(/\s+/g, ' ').trim();

    if (!clean) throw new BadRequestException('Informe um nome para o chat.');

    chat.title = clean;
    await chat.save();

    return { id: chat._id, title: chat.title };
  }

  async remove(userId: string, chatId: string) {
    const chat = await this.getOwned(userId, chatId);

    await Promise.all([
      this.messages.deleteMany({ chatId: chat._id }),
      this.files.deleteMany({ chatId: chat._id }),
      this.storage.removeChat(userId, chat._id.toString()),
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

    const fileId = new Types.ObjectId();
    const storedAs = await this.storage.save(userId, chat._id.toString(), fileId.toString(), file);

    try {
      await this.files.create({
        _id: fileId,
        chatId: chat._id,
        userId,
        name,
        size: file.size,
        charCount: text.length,
        storedAs,
        chunks: this.fileText.split(text),
      });
    } catch (error) {
      await this.storage.remove(storedAs);
      throw error;
    }

    return { id: fileId, name, size: file.size, charCount: text.length, hasOriginal: true };
  }

  private async getOwnedFile(userId: string, chatId: string, fileId: string) {
    const chat = await this.getOwned(userId, chatId);
    const file = isValidObjectId(fileId)
      ? await this.files.findOne({ _id: fileId, chatId: chat._id })
      : null;

    if (!file) throw new NotFoundException('Arquivo não encontrado.');

    return file;
  }

  /** Abre o original para download (só o dono do chat). */
  async openFile(userId: string, chatId: string, fileId: string) {
    const file = await this.getOwnedFile(userId, chatId, fileId);

    if (!file.storedAs) {
      throw new NotFoundException('O original deste arquivo não foi guardado.');
    }

    return { name: file.name, stream: this.storage.open(file.storedAs) };
  }

  async removeFile(userId: string, chatId: string, fileId: string) {
    const file = await this.getOwnedFile(userId, chatId, fileId);

    if (file.storedAs) await this.storage.remove(file.storedAs);
    await file.deleteOne();

    return { message: 'Arquivo removido com sucesso.' };
  }

  /** Escolhe os trechos dos arquivos mais relacionados à pergunta. */
  private async relevantChunks(chatId: ChatDocument['_id'], question: string) {
    const files = await this.files.find({ chatId }).lean();
    const all = files.flatMap((file) => file.chunks.map((text) => ({ file: file.name, text })));

    if (all.length === 0) return [];

    const found = rankChunks(all, question, CONTEXT_CHUNKS).sort(
      (x, y) => all.indexOf(x) - all.indexOf(y),
    );

    // Pergunta genérica ("resuma o arquivo"): usa o começo do material
    return found.length > 0 ? found : all.slice(0, CONTEXT_CHUNKS);
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

    // "Estudei 2h": soma ao tempo de estudo deste conteúdo, sem usar a IA
    const loggedMinutes = this.intentRouter.detectStudyLog(content);

    if (loggedMinutes) {
      chat.studyMinutes += loggedMinutes;

      const answer = `Registrei ${formatMinutes(loggedMinutes)} de estudo neste chat. Total deste conteúdo: ${formatMinutes(chat.studyMinutes)}.`;

      await this.messages.create({ chatId: chat._id, userId, role: 'user', content, direct: true });
      await this.messages.create({ chatId: chat._id, userId, role: 'assistant', content: answer, direct: true });

      if (chat.title === 'Novo chat') {
        chat.title = content.replace(/\s+/g, ' ').slice(0, 50);
      }
      await chat.save();

      yield answer;
      return;
    }

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
      'Formate em markdown simples: títulos com "##", **negrito**, listas com "-" ou numeradas, parágrafos curtos, tabelas quando comparar itens e blocos de código só para código de verdade. Não use LaTeX nem HTML; escreva fórmulas em texto (ex.: 6 CO2 + 6 H2O -> C6H12O6 + 6 O2).',
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
