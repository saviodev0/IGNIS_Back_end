import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { StudyCyclesService } from '../study-cycles/study-cycles.service';
import { GoalsService } from '../goals/goals.service';
import { Intent } from './intent-router.service';
import { formatMinutes } from './student-context.service';

const GOAL_LABELS: Record<string, string> = {
  DAILY: 'diária',
  WEEKLY: 'semanal',
  MONTHLY: 'mensal',
};

/** Responde perguntas sobre os dados do aluno direto do banco, sem usar IA. */
@Injectable()
export class DirectAnswerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studyCycles: StudyCyclesService,
    private readonly goals: GoalsService,
  ) {}

  async answer(userId: string, intents: Intent[]): Promise<string> {
    const needsStats = intents.some((i) =>
      ['STUDY_TODAY', 'STUDY_WEEK', 'STUDY_TOTAL', 'STUDY_SUMMARY', 'STREAK', 'CYCLES'].includes(i),
    );

    const stats = needsStats ? await this.studyCycles.stats(userId) : null;
    const parts: string[] = [];

    for (const intent of intents) {
      parts.push(await this.answerOne(userId, intent, stats));
    }

    return parts.join('\n\n');
  }

  private async answerOne(
    userId: string,
    intent: Intent,
    stats: Awaited<ReturnType<StudyCyclesService['stats']>> | null,
  ): Promise<string> {
    switch (intent) {
      case 'STUDY_TODAY':
        return stats!.todayStudyMinutes > 0
          ? `Hoje você estudou ${formatMinutes(stats!.todayStudyMinutes)}.`
          : 'Hoje você ainda não concluiu nenhum ciclo de estudo.';

      case 'STUDY_WEEK':
        return stats!.weekStudyMinutes > 0
          ? `Nesta semana (desde segunda-feira) você estudou ${formatMinutes(stats!.weekStudyMinutes)}.`
          : 'Nesta semana você ainda não concluiu nenhum ciclo de estudo.';

      case 'STUDY_TOTAL':
        return `No total, você já estudou ${formatMinutes(stats!.totalStudyMinutes)} em ${stats!.completedCycles} ciclos.`;

      case 'STUDY_SUMMARY':
        return [
          'Seu tempo de estudo:',
          `• Hoje: ${formatMinutes(stats!.todayStudyMinutes)}`,
          `• Esta semana: ${formatMinutes(stats!.weekStudyMinutes)}`,
          `• Total: ${formatMinutes(stats!.totalStudyMinutes)}`,
        ].join('\n');

      case 'STREAK':
        return stats!.currentStreak > 0
          ? `Sua sequência atual é de ${stats!.currentStreak} dia(s) seguidos. Seu recorde é de ${stats!.longestStreak} dia(s).`
          : `Você não tem uma sequência ativa agora. Seu recorde é de ${stats!.longestStreak} dia(s).`;

      case 'CYCLES':
        return `Você já concluiu ${stats!.completedCycles} ciclo(s) de estudo.`;

      case 'POINTS': {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { ignisPoints: true },
        });
        return `Você tem ${user?.ignisPoints ?? 0} pontos IGNIS.`;
      }

      case 'RANKING': {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, ignisPoints: true },
        });
        if (!user) return 'Não encontrei seus dados no ranking.';

        // Mesmo critério de desempate do GET /users/ranking
        const ahead = await this.prisma.user.count({
          where: {
            OR: [
              { ignisPoints: { gt: user.ignisPoints } },
              { ignisPoints: user.ignisPoints, id: { lt: user.id } },
            ],
          },
        });
        return `Você está na ${ahead + 1}ª posição do ranking, com ${user.ignisPoints} pontos.`;
      }

      case 'GOALS': {
        const now = new Date();
        const active = (await this.goals.findAll(userId)).filter(
          (goal) => goal.startDate <= now && goal.endDate >= now,
        );

        if (active.length === 0) return 'Você não tem nenhuma meta ativa no momento.';

        return [
          'Suas metas ativas:',
          ...active.map(
            (goal) =>
              `• Meta ${GOAL_LABELS[goal.type] ?? goal.type}: ${formatMinutes(goal.progressMinutes)} de ${formatMinutes(goal.targetMinutes)} (${goal.progressPercent}%)`,
          ),
        ].join('\n');
      }
    }
  }
}
