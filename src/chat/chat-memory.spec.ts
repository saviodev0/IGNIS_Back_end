jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../study-cycles/study-cycles.service', () => ({ StudyCyclesService: class {} }));
jest.mock('../goals/goals.service', () => ({ GoalsService: class {} }));

import { formatMemory, mentionsPastStudy, shouldUseMemory } from './chat-memory';

describe('mentionsPastStudy', () => {
  it.each([
    ['Lembra do que estudamos na semana passada?', true],
    ['vamos continuar de onde parei', true],
    ['eu já estudei isso no outro chat', true],
    ['quero revisar mitose', true],
    ['Explique a fotossíntese', false],
    ['o que é um buraco negro?', false],
  ])('%s', (message, expected) => {
    expect(mentionsPastStudy(message)).toBe(expected);
  });
});

describe('shouldUseMemory', () => {
  it('usa no começo da conversa e depois só se o aluno citar o passado', () => {
    expect(shouldUseMemory('Explique mitose', 0)).toBe(true);
    expect(shouldUseMemory('Explique mitose', 2)).toBe(true);
    expect(shouldUseMemory('Explique mitose', 8)).toBe(false);
    expect(shouldUseMemory('lembra do que vimos?', 8)).toBe(true);
  });
});

describe('formatMemory', () => {
  it('lista título, tempo, arquivos e resumo cortado', () => {
    const text = formatMemory([
      { title: 'Cálculo 1', studyMinutes: 90, files: ['Apostila.pdf'], summary: 'x'.repeat(500) },
      { title: 'Biologia', files: [] },
    ])!;

    const [first, second] = text.split('\n');
    expect(first).toContain('"Cálculo 1" (1h30 estudadas; arquivos: Apostila.pdf)');
    expect(first.length).toBeLessThan(400);
    expect(second).toBe('- "Biologia"');
  });

  it('sem chats devolve null e limita a 4', () => {
    expect(formatMemory([])).toBeNull();
    const many = Array.from({ length: 9 }, (_, i) => ({ title: `Chat ${i}`, files: [] }));
    expect(formatMemory(many)!.split('\n')).toHaveLength(4);
  });
});
