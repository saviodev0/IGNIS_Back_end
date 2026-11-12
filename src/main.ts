import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { checkProductionEnv, parseOrigins } from './config/env';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  // Em produção, não sobe com configuração faltando ou insegura
  const { errors, warnings } = checkProductionEnv();
  warnings.forEach((warning) => logger.warn(warning));
  if (errors.length) {
    errors.forEach((error) => logger.error(error));
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  

  // Atrás de proxy/load balancer (TRUST_PROXY=1) o IP real vem do X-Forwarded-For
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  }

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: parseOrigins(process.env.CORS_ORIGINS),
    credentials: true,
  });

  // Deixa o Docker parar o container com SIGTERM sem cortar requisições nem conexões dos bancos
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();