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
import { StudyMaterial } from './schemas/study-material.schema';
import { searchChunks } from './search';
import { FileTextService } from './file-text.service';
import { formatMemory, shouldUseMemory } from './chat-memory';
import { EmbeddingService } from './embedding.service';
import { buildSystemPrompt } from './system-prompt';
import { GoalsService } from '../goals/goals.service';
import { GoalCommand, GoalType, goalLabel, parseGoalCommand } from './goal-command';
import { AiMetricsService } from './ai-metrics.service';
import type { Feedback } from './dto/set-feedback.dto';
import { buildTextSearch, makeSnippet, SEARCH_MAX_CHATS, SEARCH_MAX_SNIPPETS_PER_CHAT, searchTerms } from './chat-search';
import { errorLabel, MetricTimer } from './ai-metrics';
import { UsageService } from './usage.service';
import { TokenUsage } from './usage';
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

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly embedding = new Set<string>(); // arquivos cujos vetores estão sendo gerados

  constructor(
    @InjectModel(Chat.name) private readonly chats: Model<Chat>,
    @InjectModel(ChatMessage.name) private readonly messages: Model<ChatMessage>,
    @InjectModel(ChatFile.name) private readonly files: Model<ChatFile>,
    @InjectModel(StudyMaterial.name) private readonly materials: Model<StudyMaterial>,
    private readonly fileText: FileTextService,
    private readonly storage: FileStorageService,
    private readonly embeddings: EmbeddingService,
    private readonly usage: UsageService,
    private readonly goals: GoalsService,
    private readonly groq: GroqService,
    private readonly aiMetrics: AiMetricsService,
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

  /**
   * Busca nos títulos e nas mensagens do aluno (só nos dele). Ignora acentos e maiúsculas e acha variações da
   * palavra no plural ("mitocôndria" acha "mitocôndrias"), mas não pedaços dela ("mito"). Usa o índice de texto, então
   * não varre a coleção. Devolve até 20 chats, os mais relevantes primeiro, cada um com até 3 trechos.
   */
  async search(userId: string, q: string) {
    const terms = searchTerms(q);
    const text = buildTextSearch(q);
    if (!text) return [];
    const score = { score: { $meta: 'textScore' as const } };

    const [titles, messages] = await Promise.all([
      this.chats
        .find({ userId, $text: { $search: text } }, score)
        .sort(score)
        .limit(SEARCH_MAX_CHATS)
        .select('title updatedAt')
        .lean(),
      this.messages
        .find({ userId, $text: { $search: text } }, score)
        .sort(score)
        .limit(SEARCH_MAX_CHATS * SEARCH_MAX_SNIPPETS_PER_CHAT * 4)
        .select('chatId role content createdAt')
        .lean(),
    ]);

    type Result = {
      chatId: string;
      title: string;
      updatedAt: Date;
      titleMatch: boolean;
      matches: { messageId: string; role: 'user' | 'assistant'; snippet: string }[];
    };
    const found = new Map<string, Result>();

    for (const chat of titles) {
      found.set(String(chat._id), { chatId: String(chat._id), title: chat.title, updatedAt: (chat as any).updatedAt, titleMatch: true, matches: [] });
    }

    for (const message of messages) {
      const chatId = String(message.chatId);
      let result = found.get(chatId);

      if (!result) {
        if (found.size >= SEARCH_MAX_CHATS) continue;
        result = { chatId, title: '', updatedAt: new Date(0), titleMatch: false, matches: [] };
        found.set(chatId, result);
      }

      if (result.matches.length < SEARCH_MAX_SNIPPETS_PER_CHAT) {
        result.matches.push({ messageId: String(message._id), role: message.role, snippet: makeSnippet(message.content, terms) });
      }
    }

    // Chats achados só por mensagem ainda não têm título nem data
    const missing = [...found.values()].filter((result) => !result.title);
    if (missing.length) {
      const info = await this.chats
        .find({ userId, _id: { $in: missing.map((result) => result.chatId) } })
        .select('title updatedAt')
        .lean();

      for (const chat of info) {
        const result = found.get(String(chat._id));
        if (!result) continue;

        result.title = chat.title;
        result.updatedAt = (chat as any).updatedAt;
      }
    }

    return [...found.values()].slice(0, SEARCH_MAX_CHATS);
  }

  async get(userId: string, chatId: string) {
    const chat = await this.getOwned(userId, chatId);

    const [messages, files] = await Promise.all([
      this.messages
        .find({ chatId: chat._id })
        .sort({ createdAt: 1, _id: 1 })
        .select('role content sources feedback direct createdAt')
        .lean(),
      this.files.find({ chatId: chat._id }).select('name size charCount createdAt storedAs').lean(),
    ]);

    return {
      id: chat._id,
      title: chat.title,
      studyMinutes: chat.studyMinutes,
      // Resposta da IA sem avaliação volta como null, para o app tratar sempre do mesmo jeito
      messages: messages.map((message) => (message.role === 'assistant' ? { ...message, feedback: message.feedback ?? null } : message)),
      files: files.map(({ storedAs, ...file }) => ({ ...file, hasOriginal: !!storedAs })),
    };
  }

  /**
   * 👍/👎 do aluno numa resposta da IA; `null` remove a avaliação. Só o dono do chat avalia, e só respostas da IA
   * (a pergunta do aluno e as respostas montadas direto do banco, como "criei a meta", não são da IA).
   */
  async setFeedback(userId: string, chatId: string, messageId: string, feedback: Feedback | null) {
    const chat = await this.getOwned(userId, chatId);

    if (!isValidObjectId(messageId)) {
      throw new NotFoundException('Mensagem não encontrada');
    }

    const message = await this.messages.findOne({ _id: messageId, chatId: chat._id }).select('role direct').lean();

    if (!message) {
      throw new NotFoundException('Mensagem não encontrada');
    }

    if (message.role !== 'assistant' || message.direct) {
      throw new BadRequestException('Só é possível avaliar respostas da IA.');
    }

    await this.messages.updateOne({ _id: messageId }, feedback ? { $set: { feedback } } : { $unset: { feedback: '' } });

    return { id: messageId, feedback };
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
      this.materials.deleteMany({ chatId: chat._id }),
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

  /** Título, tempo, arquivos e resumo dos últimos chats do aluno (exceto o atual). */
  private async otherChatsMemory(userId: string, currentChatId: ChatDocument['_id']) {
    const others = await this.chats
      .find({ userId, _id: { $ne: currentChatId } })
      .sort({ updatedAt: -1 })
      .limit(4)
      .select('title summary studyMinutes')
      .lean();

    if (others.length === 0) return null;

    const files = await this.files
      .find({ chatId: { $in: others.map((chat) => chat._id) } })
      .select('chatId name')
      .lean();

    return formatMemory(
      others.map((chat) => ({
        title: chat.title,
        summary: chat.summary,
        studyMinutes: chat.studyMinutes,
        files: files.filter((file) => file.chatId.equals(chat._id)).map((file) => file.name),
      })),
    );
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

    let query: number[] | undefined;

    if (all.some((chunk) => chunk.vector)) {
      [query] = (await this.embeddings.embed([question], 'query', false)) ?? [];
    }

    return searchChunks(all, question, query);
  }

  // =========================
  // MENSAGENS (STREAMING)
  // =========================

  /**
   * Salva a mensagem do aluno, chama a IA e devolve os pedaços da resposta.
   * A resposta completa é salva no Mongo ao final (ou parcial, se o aluno cancelar).
   *
   * Com `replaceLast`, a nova pergunta e a nova resposta trocam a última pergunta e a última resposta da IA
   * (regenerar ou editar a pergunta). O par antigo só é apagado quando chega resposta nova: se a IA falhar, o
   * aluno continua com o que já tinha. Nesse modo tudo vai para a IA, sem os atalhos de "criar meta", "estudei 2h"
   * e perguntas sobre os próprios números, que têm efeito próprio e não podem ser refeitos.
   */
  async *sendMessage(
    userId: string,
    chatId: string,
    content: string,
    signal?: AbortSignal,
    options: { replaceLast?: boolean } = {},
  ): AsyncGenerator<ChatEvent> {
    const chat = await this.getOwned(userId, chatId);
    const replaced = options.replaceLast ? await this.lastAiExchange(chat._id) : [];

    // "Criar meta semanal de 10h": cria a meta no app, sem usar a IA
    const goalCommand = options.replaceLast ? null : parseGoalCommand(content);

    if (goalCommand) {
      const answer = await this.createGoalFromChat(userId, goalCommand);

      await this.messages.create({ chatId: chat._id, userId, role: 'user', content, direct: true });
      await this.messages.create({ chatId: chat._id, userId, role: 'assistant', content: answer, direct: true });

      if (chat.title === 'Novo chat') {
        chat.title = content.replace(/\s+/g, ' ').slice(0, 50);
      }
      await chat.save();

      yield { type: 'delta', content: answer };
      return;
    }

    // "Estudei 2h": soma ao tempo de estudo deste conteúdo, sem usar a IA
    const loggedMinutes = options.replaceLast ? null : this.intentRouter.detectStudyLog(content);

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
    const intents = options.replaceLast ? null : this.intentRouter.detect(content);

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

    // Cota diária de tokens (as respostas diretas do banco acima não passam por aqui nem gastam cota)
    await this.usage.assertWithinLimit(userId);

    const previous = await this.messages
      .find({ chatId: chat._id, _id: { $nin: replaced } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(HISTORY_WINDOW)
      .select('role content')
      .lean();
    previous.reverse();

    // Só quando o aluno pede um plano, a IA recebe o histórico detalhado (evita gastar tokens à toa)
    const wantsPlan = this.intentRouter.wantsStudyPlan(content);

    // Continuidade entre chats: só no começo da conversa ou quando o aluno cita estudos anteriores
    const memoryPromise = shouldUseMemory(content, previous.length)
      ? this.otherChatsMemory(userId, chat._id)
      : Promise.resolve(null);

    const [studentInfo, chunks, planInfo, fileNames, memory, hasFiles] = await Promise.all([
      this.studentContext.build(userId, chat.studyMinutes),
      this.relevantChunks(chat._id, content),
      wantsPlan ? this.studentContext.buildPlan(userId) : null,
      wantsPlan ? this.files.find({ chatId: chat._id }).distinct('name') : [],
      memoryPromise,
      this.files.exists({ chatId: chat._id }),
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
      { role: 'system', content: buildSystemPrompt({ studentInfo, summary: chat.summary, chunks, planInfo, fileNames, memory }) },
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

    // Métricas desta resposta (só números e rótulos, nunca o texto)
    let failure: unknown = null;
    let model = '';
    let usedFallback = false;
    let tokens: TokenUsage = { promptTokens: 0, completionTokens: 0 };
    const track = this.trackUsage(userId);
    const timer = new MetricTimer();

    try {
      if (sources.length > 0) yield { type: 'sources', sources };

      for await (const piece of this.groq.stream(
        llmMessages,
        signal,
        (usage) => {
          tokens = usage;
          track(usage);
        },
        (info) => {
          model = info.model;
          usedFallback = info.fallback;
        },
      )) {
        timer.firstToken();
        answer += piece;
        yield { type: 'delta', content: piece };
      }
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      // Se o aluno cancelou, qualquer erro que sobrou na leitura é consequência disso, não falha da IA
      const cancelled = Boolean(signal?.aborted);

      void this.aiMetrics.record({
        model,
        fallback: usedFallback,
        firstTokenMs: timer.firstTokenMs,
        totalMs: timer.totalMs,
        error: cancelled ? null : failure ? errorLabel(failure) : !answer ? 'resposta_vazia' : null,
        cancelled,
        usedSources: sources.length > 0,
        sourceCount: sources.length,
        hasFiles: Boolean(hasFiles),
        promptTokens: tokens.promptTokens,
        completionTokens: tokens.completionTokens,
      });

      if (answer) {
        await this.messages.create({ chatId: chat._id, userId, role: 'assistant', content: answer, sources });
        // Chegou resposta nova: agora sim sai o par antigo (com a avaliação 👍/👎 dele)
        if (replaced.length) await this.messages.deleteMany({ _id: { $in: replaced } });
      } else {
        // Sem resposta (erro da IA/cancelado): descarta a pergunta para o aluno poder reenviar
        await userMessage.deleteOne();
      }

      await chat.save();

      this.summarizeIfNeeded(chat._id.toString(), userId).catch((error) =>
        this.logger.warn(`Falha ao resumir chat ${chat._id}: ${error.message}`),
      );
    }
  }

  /**
   * Ids da última pergunta e da última resposta da IA do chat, para `replaceLast`.
   * Só vale se a última troca foi com a IA: respostas montadas direto do banco (criar meta, registrar estudo)
   * têm efeito próprio e não são refeitas.
   */
  private async lastAiExchange(chatId: Types.ObjectId): Promise<Types.ObjectId[]> {
    const [last, before] = await this.messages
      .find({ chatId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(2)
      .select('role direct')
      .lean();

    if (last?.role !== 'assistant' || last.direct || before?.role !== 'user' || before.direct) {
      throw new BadRequestException('Só é possível refazer uma resposta da IA, e só a última.');
    }

    return [before._id, last._id] as Types.ObjectId[];
  }

  private async createGoalFromChat(userId: string, command: GoalCommand): Promise<string> {
    if (command.kind === 'invalid') return `Não criei a meta. ${command.reason}`;

    try {
      const goal = await this.goals.create(userId, command.type, command.minutes);
      const { label, per } = goalLabel(command.type);
      const until = new Date(goal.endDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

      return `Meta ${label} criada: ${formatMinutes(command.minutes)} ${per}, valendo até ${until}. Você acompanha o progresso na tela de metas.`;
    } catch (error: any) {
      this.logger.warn(`Não foi possível criar a meta pelo chat: ${error.message}`);

      const reason =
        error instanceof BadRequestException
          ? error.message.replace(/\b(daily|weekly|monthly)\b/gi, (type: string) => goalLabel(type.toUpperCase() as GoalType).label)
          : 'Tente de novo em instantes.';

      return `Não criei a meta. ${reason}`;
    }
  }

  /** Callback que soma os tokens de uma chamada à IA na cota do aluno. */
  private trackUsage(userId: string) {
    return (tokens: TokenUsage) => {
      this.usage.record(userId, tokens).catch((error) => this.logger.warn(`Falha ao registrar uso: ${error.message}`));
    };
  }

  /** Mantém o custo baixo: mensagens fora da janela viram um resumo curto. */
  private async summarizeIfNeeded(chatId: string, userId: string) {
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
    ], 800, this.trackUsage(userId));

    if (!summary) return;

    chat.summary = summary;
    chat.summarizedCount = windowStart;
    await chat.save();
  }
}
