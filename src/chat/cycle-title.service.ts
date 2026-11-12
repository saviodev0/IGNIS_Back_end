import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';

import { GroqService } from './groq.service';
import { UsageService } from './usage.service';
import { buildTitleContext, cleanSuggestedTitle, TITLE_SYSTEM } from './title-suggestion';
import { Chat } from './schemas/chat.schema';
import { ChatFile } from './schemas/chat-file.schema';
import { ChatMessage } from './schemas/message.schema';

@Injectable()
export class CycleTitleService {
  private readonly logger = new Logger(CycleTitleService.name);

  constructor(
    @InjectModel(Chat.name) private readonly chats: Model<Chat>,
    @InjectModel(ChatFile.name) private readonly files: Model<ChatFile>,
    @InjectModel(ChatMessage.name) private readonly messages: Model<ChatMessage>,
    private readonly groq: GroqService,
    private readonly usage: UsageService,
  ) {}

  /** Sugere o título de um ciclo a partir de uma conversa do aluno (ou da mais recente). */
  async suggest(userId: string, chatId?: string) {
    const chat = chatId
      ? isValidObjectId(chatId)
        ? await this.chats.findOne({ _id: chatId, userId })
        : null
      : await this.chats.findOne({ userId }).sort({ updatedAt: -1 });

    if (!chat) {
      throw new NotFoundException(
        chatId ? 'Chat não encontrado' : 'Você ainda não tem conversas para sugerir um título.',
      );
    }

    const [files, questions] = await Promise.all([
      this.files.find({ chatId: chat._id }).sort({ createdAt: 1 }).select('name').lean(),
      this.messages.find({ chatId: chat._id, role: 'user' }).sort({ createdAt: -1 }).limit(3).select('content').lean(),
    ]);

    const context = buildTitleContext({
      chatTitle: chat.title,
      summary: chat.summary,
      fileNames: files.map((file) => file.name),
      questions: questions.map((message) => message.content),
    });

    if (!context) {
      throw new BadRequestException('Converse ou envie um arquivo neste chat para sugerir um título.');
    }

    await this.usage.assertWithinLimit(userId);

    // Margem para o raciocínio do modelo: o título em si tem poucos tokens
    const raw = await this.groq.complete(
      [
        { role: 'system', content: TITLE_SYSTEM },
        { role: 'user', content: context },
      ],
      300,
      (tokens) => {
        this.usage.record(userId, tokens).catch((error) => this.logger.warn(`Falha ao registrar uso: ${error.message}`));
      },
    );

    const title = cleanSuggestedTitle(raw);

    if (!title) {
      throw new BadGatewayException('A IA não conseguiu sugerir um título. Tente de novo.');
    }

    return { title, chatId: String(chat._id) };
  }
}
