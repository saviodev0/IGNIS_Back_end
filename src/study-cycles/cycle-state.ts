export type CycleStatus = 'running' | 'paused' | 'completed';

interface CycleRecord {
  durationMinutes: number;
  startedAt: Date;
  completed: boolean;
  completedAt: Date | null;
  pausedAt: Date | null;
  pausedSeconds: number;
}

/**
 * Estado de um ciclo para o front: situação e segundos restantes.
 * O tempo parado (pausas) não conta como estudo, e o relógio congela enquanto pausado.
 */
export function describeCycle<T extends CycleRecord>(cycle: T, now = new Date()) {
  const status: CycleStatus = cycle.completed ? 'completed' : cycle.pausedAt ? 'paused' : 'running';

  const reference = (status === 'completed' ? cycle.completedAt : cycle.pausedAt) ?? now;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((reference.getTime() - cycle.startedAt.getTime()) / 1000) - cycle.pausedSeconds,
  );

  return {
    ...cycle,
    status,
    remainingSeconds: Math.max(0, cycle.durationMinutes * 60 - elapsedSeconds),
    ignisReward: cycle.durationMinutes,
  };
}
