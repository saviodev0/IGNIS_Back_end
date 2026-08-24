import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const achievements = [
    {
      code: 'FIRST_FIRE',
      name: 'Acendendo a chama',
      description: 'Complete seu primeiro ciclo de estudos',
      icon: '🔥',
      type: 'CYCLES',
      requirement: 1,
    },

    {
      code: 'WARMING_UP',
      name: 'Aquecendo',
      description: 'Complete 4 ciclos de estudos',
      icon: '🔥',
      type: 'CYCLES',
      requirement: 4,
    },

    {
      code: 'FOCUS_MASTER',
      name: 'Foco Total',
      description: 'Complete 10 ciclos de estudos',
      icon: '🔥',
      type: 'CYCLES',
      requirement: 10,
    },

    {
      code: 'ONE_HOUR',
      name: '1 Hora',
      description: 'Estude por um total de 60 minutos',
      icon: '⏱️',
      type: 'MINUTES',
      requirement: 60,
    },

    {
      code: 'THREE_DAY_STREAK',
      name: '3 Dias com IGNIS',
      description: 'Estude por 3 dias consecutivos',
      icon: '🔥',
      type: 'STREAK',
      requirement: 3,
    },

    {
      code: 'SEVEN_DAY_STREAK',
      name: '7 Dias de Foco',
      description: 'Estude por 7 dias consecutivos',
      icon: '🔥',
      type: 'STREAK',
      requirement: 7,
    },
  ];

  for (const achievement of achievements) {
    await prisma.achievement.upsert({
      where: {
        code: achievement.code,
      },

      update: {
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        type: achievement.type,
        requirement: achievement.requirement,
      },

      create: achievement,
    });
  }

  console.log('Conquistas cadastradas com sucesso!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });