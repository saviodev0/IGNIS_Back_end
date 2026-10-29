import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { CreateChatDto } from './dto/create-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { AddStudyTimeDto } from './dto/add-study-time.dto';

@Controller('chats')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  list(@Req() request: any) {
    return this.chatService.list(request.user.sub);
  }

  @Post()
  create(@Req() request: any, @Body() dto: CreateChatDto) {
    return this.chatService.create(request.user.sub, dto.title);
  }

  @Get(':id')
  get(@Req() request: any, @Param('id') id: string) {
    return this.chatService.get(request.user.sub, id);
  }

  @Delete(':id')
  remove(@Req() request: any, @Param('id') id: string) {
    return this.chatService.remove(request.user.sub, id);
  }

  @Patch(':id/study-time')
  addStudyTime(
    @Req() request: any,
    @Param('id') id: string,
    @Body() dto: AddStudyTimeDto,
  ) {
    return this.chatService.addStudyTime(request.user.sub, id, dto.minutes);
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

      if (!first.done) send({ type: 'delta', content: first.value });

      for await (const piece of stream) {
        send({ type: 'delta', content: piece });
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
