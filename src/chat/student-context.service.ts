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

const PLAN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const dayLabel = (date: Date) =>
  date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

/** Calendário pronto dos próximos dias, para a IA não errar o dia da semana de cada data. */
export function upcomingDays(now: Date, days = 14): string {
  return Array.from({ length: days }, (_, index) =>
    dayLabel(new Date(now.getFullYear(), now.getMonth(), now.getDate() + index + 1)),
  ).join('; ');
}

/**
 * Resume os ciclos concluídos dos últimos dias para a IA montar um plano:
 * minutos por dia, média, melhor dia da semana e dias sem estudo.
 */
export function summarizeStudyDays(
  cycles: { completedAt: Date | null; durationMinutes: number }[],
  now: Date,
  days = PLAN_DAYS,
): string {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const perDay = new Map<string, number>();
  for (const cycle of cycles) {
    if (!cycle.completedAt) continue;
    const key = dayKey(cycle.completedAt);
    perDay.set(key, (perDay.get(key) ?? 0) + cycle.durationMinutes);
  }

  const list = Array.from({ length: days }, (_, index) => {
    const date = new Date(today.getTime() - (days - 1 - index) * DAY_MS);
    return { date, minutes: perDay.get(dayKey(date)) ?? 0 };
  });

  const total = list.reduce((sum, day) => sum + day.minutes, 0);
  const studied = list.filter((day) => day.minutes > 0);

  if (total === 0) {
    return `Nos últimos ${days} dias o aluno não concluiu nenhum ciclo (comece com um plano leve e realista).`;
  }

  const byWeekday = new Map<string, number>();
  for (const day of studied) {
    const name = day.date.toLocaleDateString('pt-BR', { weekday: 'long' });
    byWeekday.set(name, (byWeekday.get(name) ?? 0) + day.minutes);
  }
  const best = [...byWeekday.entries()].sort((a, b) => b[1] - a[1])[0];

  return [
    `Minutos estudados por dia nos últimos ${days} dias: ${list.map((d) => `${dayLabel(d.date)} ${formatMinutes(d.minutes)}`).join('; ')}`,
    `Dias com estudo: ${studied.length} de ${days} | Média por dia estudado: ${formatMinutes(Math.round(total / studied.length))} | Média geral: ${formatMinutes(Math.round(total / days))}`,
    `Dia da semana em que mais estudou: ${best[0]} (${formatMinutes(best[1])})`,
  ].join('\n');
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

  /** Dados extras para montar plano de estudo: histórico recente e quanto falta por dia em cada meta. */
  async buildPlan(userId: string): Promise<string> {
    const now = new Date();
    const since = new Date(now);
    since.setHours(0, 0, 0, 0);
    since.setTime(since.getTime() - (PLAN_DAYS - 1) * DAY_MS);

    const [cycles, goals] = await Promise.all([
      this.prisma.studyCycle.findMany({
        where: { userId, completed: true, completedAt: { gte: since } },
        select: { completedAt: true, durationMinutes: true },
      }),
      this.goals.findAll(userId),
    ]);

    const lines = [
      `Hoje é ${now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}`,
      `Próximos dias: ${upcomingDays(now)}`,
      summarizeStudyDays(cycles, now),
    ];

    for (const goal of goals.filter((g) => g.endDate >= now && g.startDate <= now)) {
      const remaining = Math.max(goal.targetMinutes - goal.progressMinutes, 0);
      const daysLeft = Math.max(Math.ceil((goal.endDate.getTime() - now.getTime()) / DAY_MS), 1);

      lines.push(
        `Meta ${GOAL_LABELS[goal.type] ?? goal.type}: faltam ${formatMinutes(remaining)} em ${daysLeft} dia(s) (~${formatMinutes(Math.ceil(remaining / daysLeft))} por dia)`,
      );
    }

    return lines.join('\n');
  }
}
