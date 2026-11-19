import { Logger } from '@nestjs/common';

// Vários testes provocam falhas de propósito (IA fora do ar, OCR que quebra, Mongo que cai) e o Nest imprimiria
// cada uma como se fosse um problema real, escondendo o resultado. Para ver esses logs: TEST_LOGS=1 npm test
if (!process.env.TEST_LOGS) {
  Logger.overrideLogger(false);
}
