import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';

/**
 * Guarda os arquivos originais no disco do servidor, fora do git:
 * `<UPLOADS_DIR>/<userId>/<chatId>/<fileId>.<ext>`.
 * O nome original fica só no Mongo; no disco o nome é o id do arquivo.
 */
@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('UPLOADS_DIR') ?? 'arquivos');
  }

  /** Salva o arquivo e devolve o caminho relativo à pasta raiz de uploads. */
  async save(userId: string, chatId: string, fileId: string, file: Express.Multer.File) {
    const relative = join(userId, chatId, `${fileId}${extname(file.originalname).toLowerCase()}`);
    const target = this.resolveSafe(relative);

    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, file.buffer);

    return relative;
  }

  open(relative: string) {
    return createReadStream(this.resolveSafe(relative));
  }

  async remove(relative: string) {
    await rm(this.resolveSafe(relative), { force: true }).catch((error) =>
      this.logger.warn(`Falha ao apagar ${relative}: ${error.message}`),
    );
  }

  async removeChat(userId: string, chatId: string) {
    await rm(this.resolveSafe(join(userId, chatId)), { recursive: true, force: true }).catch(
      (error) => this.logger.warn(`Falha ao apagar pasta do chat ${chatId}: ${error.message}`),
    );
  }

  // Garante que o caminho continua dentro da pasta de uploads
  private resolveSafe(relative: string) {
    const target = resolve(this.root, relative);

    if (!target.startsWith(this.root + sep)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }

    return target;
  }
}
