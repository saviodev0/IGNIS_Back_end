import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { AuthGuard } from '../auth/guards/auth.guard';
import { ChatService } from './chat.service';
import { MaterialService } from './material.service';
import { CycleTitleService } from './cycle-title.service';
import { UsageService } from './usage.service';
import { PrivacyService } from './privacy.service';
import { GenerateMaterialDto } from './dto/generate-material.dto';
import { SuggestCycleTitleDto } from './dto/suggest-cycle-title.dto';
import { CreateChatDto } from './dto/create-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { AddStudyTimeDto } from './dto/add-study-time.dto';
import { RenameChatDto } from './dto/rename-chat.dto';
import { SearchChatsDto } from './dto/search-chats.dto';
import { SetFeedbackDto } from './dto/set-feedback.dto';

@Controller('chats')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly materialService: MaterialService,
    private readonly cycleTitleService: CycleTitleService,
    private readonly usageService: UsageService,
    private readonly privacyService: PrivacyService,
  ) {}

  @Get()
  list(@Req() request: any) {
    return this.chatService.list(request.user.sub);
  }

  @Post()
  create(@Req() request: any, @Body() dto: CreateChatDto) {
    return this.chatService.create(request.user.sub, dto.title);
  }

  // Apaga TODOS os dados de IA do usuário logado (conversas, arquivos e materiais)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Delete()
  removeAll(@Req() request: any) {
    return this.privacyService.removeAllData(request.user.sub);
  }

  // Sugere o título de um ciclo de estudo a partir de uma conversa (a mais recente, se não informar)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('cycle-title')
  suggestCycleTitle(@Req() request: any, @Body() dto: SuggestCycleTitleDto) {
    return this.cycleTitleService.suggest(request.user.sub, dto.chatId);
  }

  // Precisa vir antes de `:id`, senão "usage" seria lido como id de chat
  @Get('usage')
  usage(@Req() request: any) {
    return this.usageService.today(request.user.sub);
  }

  // Também precisa vir antes de `:id`
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('search')
  search(@Req() request: any, @Query() query: SearchChatsDto) {
    return this.chatService.search(request.user.sub, query.q);
  }

  @Get(':id')
  get(@Req() request: any, @Param('id') id: string) {
    return this.chatService.get(request.user.sub, id);
  }

  @Delete(':id')
  remove(@Req() request: any, @Param('id') id: string) {
    return this.chatService.remove(request.user.sub, id);
  }

  @Patch(':id')
  rename(@Req() request: any, @Param('id') id: string, @Body() dto: RenameChatDto) {
    return this.chatService.rename(request.user.sub, id, dto.title);
  }

  @Patch(':id/study-time')
  addStudyTime(
    @Req() request: any,
    @Param('id') id: string,
    @Body() dto: AddStudyTimeDto,
  ) {
    return this.chatService.addStudyTime(request.user.sub, id, dto.minutes);
  }

  // 👍/👎 numa resposta da IA; `{ "feedback": null }` remove a avaliação
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Patch(':id/messages/:messageId/feedback')
  setFeedback(
    @Req() request: any,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: SetFeedbackDto,
  ) {
    return this.chatService.setFeedback(request.user.sub, id, messageId, dto.feedback);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/files')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  addFile(
    @Req() request: any,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.chatService.addFile(request.user.sub, id, file);
  }

  @Get(':id/files/:fileId')
  async download(
    @Req() request: any,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    const { name, stream } = await this.chatService.openFile(request.user.sub, id, fileId);

    return new StreamableFile(stream, {
      type: name.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
  }

  @Delete(':id/files/:fileId')
  removeFile(@Req() request: any, @Param('id') id: string, @Param('fileId') fileId: string) {
    return this.chatService.removeFile(request.user.sub, id, fileId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':id/material')
  generateMaterial(@Req() request: any, @Param('id') id: string, @Body() dto: GenerateMaterialDto) {
    return this.materialService.generate(request.user.sub, id, dto);
  }

  @Get(':id/material')
  listMaterial(@Req() request: any, @Param('id') id: string) {
    return this.materialService.list(request.user.sub, id);
  }

  @Delete(':id/material/:materialId')
  removeMaterial(
    @Req() request: any,
    @Param('id') id: string,
    @Param('materialId') materialId: string,
  ) {
    return this.materialService.remove(request.user.sub, id, materialId);
  }

  /**
   * Resposta em streaming (Server-Sent Events). Cada evento é uma linha
   * `data: {"type":"delta","content":"..."}`, e o fim vem como `{"type":"done"}`.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':id/messages')
  async sendMessage(
    @Req() request: any,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @Res() response: Response,
  ) {
    const abort = new AbortController();
    response.on('close', () => abort.abort());

    const stream = this.chatService.sendMessage(
      request.user.sub,
      id,
      dto.content,
      abort.signal,
    );

    const send = (event: object) => response.write(`data: ${JSON.stringify(event)}\n\n`);

    let streaming = false;

    try {
      // Valida e inicia antes de abrir o SSE, para erros virarem 404/429 normais
      const first = await stream.next();

      response.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.flushHeaders();
      streaming = true;

      if (!first.done) send(first.value);

      for await (const event of stream) {
        send(event);
      }

      send({ type: 'done' });
    } catch (error: any) {
      // Antes de abrir o SSE, o erro segue para o Nest (404, 429, 503...)
      if (!streaming) throw error;

      if (!abort.signal.aborted) {
        send({ type: 'error', message: 'A resposta foi interrompida. Tente novamente.' });
      }
    } finally {
      if (streaming) response.end();
    }
  }
}
