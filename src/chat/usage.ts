export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

/** Dia local do servidor (YYYY-MM-DD): a cota zera à meia-noite nesse fuso. */
export function dayKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function nextMidnight(date = new Date()): Date {
  const next = new Date(date);
  next.setHours(24, 0, 0, 0);
  return next;
}

/** Estimativa grosseira (≈ 4 caracteres por token) para quando a API não informa o uso. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Lê o campo `usage` no formato da API (OpenAI/Groq); devolve null se não vier. */
export function readUsage(raw: any): TokenUsage | null {
  const prompt = Number(raw?.prompt_tokens);
  const completion = Number(raw?.completion_tokens);

  if (!Number.isFinite(prompt) && !Number.isFinite(completion)) return null;

  return {
    promptTokens: Number.isFinite(prompt) ? prompt : 0,
    completionTokens: Number.isFinite(completion) ? completion : 0,
  };
}

/** Limite diário lido da configuração: 0 (ou valor inválido) significa sem limite. */
export function parseLimit(value: unknown, fallback = 200_000): number {
  if (value === undefined || value === null || value === '') return fallback;

  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}
