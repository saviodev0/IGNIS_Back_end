import { formatMinutes } from './student-context.service';

const MAX_CHATS = 4;
const SUMMARY_CHARS = 280;

export interface MemoryChat {
  title: string;
  summary?: string;
  studyMinutes?: number;
  files: string[];
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** O aluno está se referindo a estudos anteriores? ("lembra", "outro chat", "da última vez", "continuar"...) */
export function mentionsPastStudy(message: string): boolean {
  return /\b(lembra\w*|outro chat|outros chats|outra conversa|conversa anterior|conversas anteriores|ultima vez|semana passada|ontem|antes|ja estudei|ja vimos|ja falamos|que conversamos|que estudamos|continu\w+|retom\w+|revis\w+)\b/.test(
    normalize(message),
  );
}

/**
 * Memória de outros chats do aluno para a IA ter continuidade. Só entra no começo de uma
 * conversa ou quando o aluno cita estudos anteriores (evita gastar tokens em toda mensagem).
 */
export function shouldUseMemory(message: string, messagesSoFar: number): boolean {
  return messagesSoFar <= 2 || mentionsPastStudy(message);
}

export function formatMemory(chats: MemoryChat[]): string | null {
  const lines = chats.slice(0, MAX_CHATS).map((chat) => {
    const details = [
      chat.studyMinutes ? `${formatMinutes(chat.studyMinutes)} estudadas` : null,
      chat.files.length ? `arquivos: ${chat.files.slice(0, 3).join(', ')}` : null,
    ].filter(Boolean);

    const summary = chat.summary?.replace(/\s+/g, ' ').trim().slice(0, SUMMARY_CHARS);

    return `- "${chat.title}"${details.length ? ` (${details.join('; ')})` : ''}${summary ? `: ${summary}` : ''}`;
  });

  return lines.length ? lines.join('\n') : null;
}
