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
import { cosine, fuseRankings, mentionsMaterial, rankChunks } from './chunk-ranker';
import { FileTextService } from './file-text.service';
import { EmbeddingService } from './embedding.service';
import { FileStorageService } from './file-storage.service';
import { GroqService, LlmMessage } from './groq.service';
import { StudentContextService, formatMinutes } from './student-context.service';
import { IntentRouterService } from './intent-router.service';
import { DirectAnswerService } from './direct-answer.service';

export type ChatEvent =
  | { type: 'delta'; content: string }
  | { type: 'sources'; sources: { file: string; page?: number }[] };

// Controle de custo da IA
const HISTORY_WINDOW = 10; // últimas mensagens enviadas na íntegra
const SUMMARY_BATCH = 10; // resume quando houver ao menos N msgs fora da janela
const DAILY_MESSAGE_LIMIT = 100; // mensagens do aluno por dia
const MAX_FILES_PER_CHAT = 5;
const CONTEXT_CHUNKS = 4; // trechos de arquivo enviados por pergunta
const SEARCH_POOL = 8; // candidatos de cada busca (palavras-chave e semântica) antes de juntar
// Similaridade mínima (modelo e5-small, medida em testes): perguntas relacionadas ficam em 0,81–0,88 e sem relação em 0,77–0,81
const SEMANTIC_MIN = 0.805;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly embedding = new Set<string>(); // arquivos cujos vetores estão sendo gerados

  constructor(
    @InjectModel(Chat.name) private readonly chats: Model<Chat>,
    @InjectModel(ChatMessage.name) private readonly messages: Model<ChatMessage>,
    @InjectModel(ChatFile.name) private readonly files: Model<ChatFile>,
    private readonly fileText: FileTextService,
    private readonly storage: FileStorageService,
    private readonly embeddings: EmbeddingService,
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
        .select('role content sources createdAt')
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

    const document = await this.fileText.extract(file);
    const chunks = this.fileText.chunk(document);
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
        charCount: document.text.length,
        storedAs,
        chunks: chunks.map((chunk) => chunk.text),
        chunkPages: chunks.map((chunk) => chunk.page),
      });
    } catch (error) {
      await this.storage.remove(storedAs);
      throw error;
    }

    // Vetores da busca semântica são gerados depois, sem atrasar a resposta do upload
    this.embedInBackground(fileId, chunks.map((chunk) => chunk.text));

    return { id: fileId, name, size: file.size, charCount: document.text.length, hasOriginal: true };
  }

  private embedInBackground(fileId: Types.ObjectId, texts: string[]) {
    const key = fileId.toString();
    if (!this.embeddings.isEnabled || this.embedding.has(key)) return;

    this.embedding.add(key);

    this.embeddings
      .embed(texts, 'passage')
      .then((vectors) => vectors && this.files.updateOne({ _id: fileId }, { $set: { embeddings: vectors } }))
      .catch((error) => this.logger.warn(`Falha ao indexar arquivo ${key}: ${error.message}`))
      .finally(() => this.embedding.delete(key));
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

  /**
   * Escolhe os trechos mais relacionados à pergunta juntando duas buscas: por palavras-chave (BM25)
   * e semântica (embeddings), que acha o trecho mesmo quando a pergunta usa outras palavras.
   */
  private async relevantChunks(chatId: ChatDocument['_id'], question: string) {
    const files = await this.files.find({ chatId }).lean();
    const all = files.flatMap((file) =>
      file.chunks.map((text, index) => ({
        file: file.name,
        page: file.chunkPages?.[index] || 0,
        text,
        vector: file.embeddings?.[index],
      })),
    );

    if (all.length === 0) return [];

    // Arquivos enviados antes da busca semântica ganham os vetores em segundo plano
    for (const file of files) {
      if (!file.embeddings?.length && file.chunks.length) this.embedInBackground(file._id, file.chunks);
    }

    const byKeyword = rankChunks(all, question, SEARCH_POOL);

    let bySemantic: typeof all = [];

    if (all.some((chunk) => chunk.vector)) {
      const [query] = (await this.embeddings.embed([question], 'query', false)) ?? [];

      if (query) {
        bySemantic = all
          .filter((chunk) => chunk.vector)
          .map((chunk) => ({ chunk, similarity: cosine(query, chunk.vector!) }))
          .filter((item) => item.similarity >= SEMANTIC_MIN)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, SEARCH_POOL)
          .map((item) => item.chunk);
      }
    }

    const found = fuseRankings([byKeyword, bySemantic], CONTEXT_CHUNKS).sort(
      (x, y) => all.indexOf(x) - all.indexOf(y),
    );

    if (found.length > 0) return found;

    // Pergunta genérica sobre o material ("resuma o arquivo"): usa o começo dele.
    // Pergunta sem relação com o material: não manda trechos (economiza tokens e não mostra fonte falsa).
    return mentionsMaterial(question) ? all.slice(0, CONTEXT_CHUNKS) : [];
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
  ): AsyncGenerator<ChatEvent> {
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

      yield { type: 'delta', content: answer };
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

        yield { type: 'delta', content: answer };
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

    // Só quando o aluno pede um plano, a IA recebe o histórico detalhado (evita gastar tokens à toa)
    const wantsPlan = this.intentRouter.wantsStudyPlan(content);

    const [studentInfo, chunks, planInfo, fileNames] = await Promise.all([
      this.studentContext.build(userId, chat.studyMinutes),
      this.relevantChunks(chat._id, content),
      wantsPlan ? this.studentContext.buildPlan(userId) : null,
      wantsPlan ? this.files.find({ chatId: chat._id }).distinct('name') : [],
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
      { role: 'system', content: this.systemPrompt(studentInfo, chat.summary, chunks, planInfo, fileNames) },
      ...previous.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ];

    let answer = '';

    // Arquivos e páginas que foram para a IA; o aluno vê de onde veio a resposta
    const sources = [
      ...new Map(
        chunks.map((chunk) => [`${chunk.file}#${chunk.page ?? 0}`, { file: chunk.file, page: chunk.page || undefined }]),
      ).values(),
    ];

    try {
      if (sources.length > 0) yield { type: 'sources', sources };

      for await (const piece of this.groq.stream(llmMessages, signal)) {
        answer += piece;
        yield { type: 'delta', content: piece };
      }
    } finally {
      if (answer) {
        await this.messages.create({ chatId: chat._id, userId, role: 'assistant', content: answer, sources });
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
    chunks: { file: string; page?: number; text: string }[],
    planInfo: string | null = null,
    fileNames: string[] = [],
  ): string {
    const parts = [
      'Você é o assistente de estudos do IGNIS, um app de ciclos de estudo (pomodoro) com pontos, metas e sequências.',
      'Responda sempre em português do Brasil, de forma clara, didática e motivadora, sem enrolação.',
      'Formate em markdown simples: títulos com "##", **negrito**, listas com "-" ou numeradas, parágrafos curtos, tabelas quando comparar itens e blocos de código só para código de verdade. Não use LaTeX nem HTML; escreva fórmulas em texto (ex.: 6 CO2 + 6 H2O -> C6H12O6 + 6 O2).',
      'Use os dados do aluno quando ajudar (ex.: sugerir ciclos, comentar a sequência ou metas), sem inventar números.',
      `\n## Dados do aluno\n${studentInfo}`,
    ];

    if (planInfo) {
      parts.push(
        `\n## Histórico recente de estudo (para o plano)\n${planInfo}` +
          (fileNames.length ? `\nMateriais enviados neste chat: ${fileNames.join(', ')}` : '') +
          '\n\nO aluno pediu um plano de estudo. Monte um plano realista usando SOMENTE os números acima: ' +
          'respeite a média que ele já consegue estudar (aumente no máximo 20%), priorize os dias da semana em que ele rende mais, ' +
          'use as datas reais a partir de "Hoje é ..." (confira o dia da semana de cada data), distribua em ciclos de 25 minutos com pausas, inclua as metas ativas e termine com uma tabela dia a dia (dia, assunto, ciclos, tempo). ' +
          'Se faltarem dados (por exemplo, prazo da prova ou matéria), faça o melhor plano possível e pergunte no fim o que faltou.',
      );
    }

    if (summary) {
      parts.push(`\n## Resumo da conversa até aqui\n${summary}`);
    }

    if (chunks.length > 0) {
      parts.push(
        '\n## Trechos do material enviado pelo aluno\n' +
          'Priorize estes trechos quando a pergunta for sobre o material; se a resposta não estiver neles, avise e complemente com seu conhecimento geral. Quando usar o material, cite a fonte entre parênteses no fim da frase, copiando o nome exato do arquivo e a página, por exemplo (Biologia.pdf, p. 3) — só use arquivos e páginas que aparecem acima.\n' +
          chunks.map((chunk) => `[${chunk.file}${chunk.page ? `, p. ${chunk.page}` : ''}]\n${chunk.text}`).join('\n---\n'),
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
