import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { FileStorageService } from './file-storage.service';
import { Chat } from './schemas/chat.schema';
import { ChatFile } from './schemas/chat-file.schema';
import { ChatMessage } from './schemas/message.schema';
import { StudyMaterial } from './schemas/study-material.schema';

@Injectable()
export class PrivacyService {
  constructor(
    @InjectModel(Chat.name) private readonly chats: Model<Chat>,
    @InjectModel(ChatMessage.name) private readonly messages: Model<ChatMessage>,
    @InjectModel(ChatFile.name) private readonly files: Model<ChatFile>,
    @InjectModel(StudyMaterial.name) private readonly materials: Model<StudyMaterial>,
    private readonly storage: FileStorageService,
  ) {}

  /**
   * Apaga tudo que o aluno guardou na IA: conversas, mensagens, arquivos (inclusive os originais no disco)
   * e materiais de estudo. Os contadores de uso de tokens ficam: não têm conteúdo e sustentam a cota diária
   * (apagar os dados não pode zerar o consumo do dia).
   */
  async removeAllData(userId: string) {
    const [messages, files, materials, chats] = await Promise.all([
      this.messages.deleteMany({ userId }),
      this.files.deleteMany({ userId }),
      this.materials.deleteMany({ userId }),
      this.chats.deleteMany({ userId }),
    ]);

    await this.storage.removeUser(userId);

    return {
      message: 'Todos os seus dados de IA foram apagados.',
      deleted: {
        chats: chats.deletedCount ?? 0,
        messages: messages.deletedCount ?? 0,
        files: files.deletedCount ?? 0,
        materials: materials.deletedCount ?? 0,
      },
    };
  }
}
