import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { StudyCyclesService } from '../study-cycles/study-cycles.service';
import { GoalsService } from '../goals/goals.service';

const GOAL_LABELS: Record<string, string> = {
  DAILY: 'diária',
  WEEKLY: 'semanal',
  MONTHLY: 'mensal',
};

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

@Injectable()
export class StudentContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studyCycles: StudyCyclesService,
    private readonly goals: GoalsService,
  ) {}

  /** Resumo curto do progresso do aluno, injetado no prompt da IA. */
  async build(userId: string, chatStudyMinutes: number): Promise<string> {
    const [user, stats, goals] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, isStudent: true, whichCourse: true, ignisPoints: true },
      }),
      this.studyCycles.stats(userId),
      this.goals.findAll(userId),
    ]);

    const now = new Date();
    const activeGoals = goals.filter((goal) => goal.endDate >= now && goal.startDate <= now);

    const lines = [
      `Nome: ${user?.name ?? 'aluno'}`,
      user?.isStudent && user.whichCourse ? `Curso: ${user.whichCourse}` : null,
      `Estudo total: ${formatMinutes(stats.totalStudyMinutes)} em ${stats.completedCycles} ciclos`,
      `Hoje: ${formatMinutes(stats.todayStudyMinutes)} | Esta semana: ${formatMinutes(stats.weekStudyMinutes)}`,
      `Sequência atual: ${stats.currentStreak} dia(s) | Maior sequência: ${stats.longestStreak} dia(s)`,
      `Pontos IGNIS: ${user?.ignisPoints ?? 0}`,
      chatStudyMinutes > 0
        ? `Tempo estudado neste conteúdo: ${formatMinutes(chatStudyMinutes)}`
        : null,
      ...activeGoals.map(
        (goal) =>
          `Meta ${GOAL_LABELS[goal.type] ?? goal.type}: ${formatMinutes(goal.progressMinutes)} de ${formatMinutes(goal.targetMinutes)} (${goal.progressPercent}%)`,
      ),
    ];

    return lines.filter(Boolean).join('\n');
  }
}
