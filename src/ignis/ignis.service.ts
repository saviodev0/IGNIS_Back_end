import { Injectable } from '@nestjs/common';

@Injectable()
export class IgnisService {
  getInfo() {
    return {
      name: 'IGNIS',
      message: 'Seu ciclo de estudos começa aqui.',
    };
  }
}