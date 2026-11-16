import { Logger, ServiceUnavailableException } from '@nestjs/common';

import { GroqService, isRetryableStatus } from './groq.service';

const sse = (text: string) =>
  new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, { status: 200 });

const completion = (text: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }), {
    status: 200,
  });

const erro = (status: number) => new Response('falhou', { status });

const make = (env: Record<string, string> = {}) =>
  new GroqService({ get: (key: string) => ({ GROQ_API_KEY: 'chave-groq', ...env })[key] } as never);

const RESERVA = { LLM_FALLBACK_MODEL: 'llama-reserva' };
const mensagens = [{ role: 'user' as const, content: 'oi' }];

async function ler(gen: AsyncGenerator<string>) {
  let out = '';
  for await (const part of gen) out += part;
  return out;
}

describe('GroqService com provedor reserva', () => {
  const fetchMock = jest.fn();
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const corpo = (chamada: number) => JSON.parse(fetchMock.mock.calls[chamada][1].body);

  it.each([429, 500, 502, 503, 408])('erro %i no principal: repete no reserva e o aluno recebe a resposta', async (status) => {
    fetchMock.mockResolvedValueOnce(erro(status)).mockResolvedValueOnce(sse('resposta do reserva'));

    const texto = await ler(make(RESERVA).stream(mensagens));

    expect(texto).toBe('resposta do reserva');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(corpo(0).model).toBe('openai/gpt-oss-120b');
    expect(corpo(1).model).toBe('llama-reserva');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`respondeu ${status}`));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('llama-reserva'));
  });

  it('falha de rede no principal também usa o reserva e registra o motivo', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(sse('ok'));

    expect(await ler(make(RESERVA).stream(mensagens))).toBe('ok');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('fetch failed'));
  });

  it('principal que não responde a tempo cai no reserva', async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    fetchMock.mockResolvedValueOnce(sse('veio do reserva'));

    const texto = await ler(make({ ...RESERVA, LLM_TIMEOUT_MS: '30' }).stream(mensagens));

    expect(texto).toBe('veio do reserva');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('tempo esgotado'));
  });

  it('o limite de tempo não corta uma resposta que já começou a chegar', async () => {
    fetchMock.mockResolvedValueOnce(sse('resposta completa'));

    expect(await ler(make({ ...RESERVA, LLM_TIMEOUT_MS: '10' }).stream(mensagens))).toBe('resposta completa');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('erro que não passa sozinho (400, 401) não aciona o reserva', async () => {
    for (const status of [400, 401, 404]) {
      fetchMock.mockReset().mockResolvedValueOnce(erro(status));
      await expect(ler(make(RESERVA).stream(mensagens))).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('se o aluno cancela a resposta, não é falha do provedor: não usa o reserva', async () => {
    const aluno = new AbortController();
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );

    const pendente = ler(make(RESERVA).stream(mensagens, aluno.signal));
    setTimeout(() => aluno.abort(), 10);

    await expect(pendente).rejects.toThrow('aborted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('principal e reserva fora do ar: o aluno recebe o aviso de IA indisponível', async () => {
    fetchMock.mockResolvedValueOnce(erro(503)).mockResolvedValueOnce(erro(503));
    await expect(ler(make(RESERVA).stream(mensagens))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset().mockResolvedValueOnce(erro(429)).mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(ler(make(RESERVA).stream(mensagens))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('também falhou'));
  });

  it('só tenta o reserva uma vez (nada de laço)', async () => {
    fetchMock.mockImplementation(async () => erro(429));
    await expect(ler(make(RESERVA).stream(mensagens))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reserva em outro provedor usa a URL, a chave e o modelo dele (e a chave da Groq não vai para lá)', async () => {
    fetchMock.mockResolvedValueOnce(erro(429)).mockResolvedValueOnce(sse('ok'));

    await ler(
      make({
        ...RESERVA,
        LLM_FALLBACK_URL: 'https://outro.exemplo/v1/chat/completions',
        LLM_FALLBACK_API_KEY: 'chave-do-reserva',
      }).stream(mensagens),
    );

    expect(fetchMock.mock.calls[0][0]).toContain('api.groq.com');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer chave-groq');
    expect(fetchMock.mock.calls[1][0]).toBe('https://outro.exemplo/v1/chat/completions');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer chave-do-reserva');
  });

  it('só com o modelo reserva configurado, usa a própria Groq e a mesma chave', async () => {
    fetchMock.mockResolvedValueOnce(erro(429)).mockResolvedValueOnce(sse('ok'));
    await ler(make(RESERVA).stream(mensagens));

    expect(fetchMock.mock.calls[1][0]).toContain('api.groq.com');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer chave-groq');
  });

  it('o reserva não herda o nível de raciocínio do gpt-oss', async () => {
    fetchMock.mockResolvedValueOnce(erro(429)).mockResolvedValueOnce(sse('ok'));
    await ler(make(RESERVA).stream(mensagens));

    expect(corpo(0).reasoning_effort).toBe('low');
    expect(corpo(1).reasoning_effort).toBeUndefined();
  });

  it('sem reserva configurado o comportamento é o de sempre: uma chamada e erro de IA indisponível', async () => {
    fetchMock.mockResolvedValueOnce(erro(429));
    await expect(ler(make().stream(mensagens))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset().mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(ler(make().stream(mensagens))).rejects.toThrow('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal).toBeUndefined();
  });

  describe('complete (resumos e títulos)', () => {
    it('repete no reserva e usa o modelo de resumo reserva quando configurado', async () => {
      fetchMock.mockResolvedValueOnce(erro(503)).mockResolvedValueOnce(completion('resumo'));

      const texto = await make({ ...RESERVA, LLM_FALLBACK_SUMMARY_MODEL: 'llama-pequeno' }).complete(mensagens);

      expect(texto).toBe('resumo');
      expect(corpo(0).model).toBe('openai/gpt-oss-20b');
      expect(corpo(1).model).toBe('llama-pequeno');
    });

    it('sem modelo de resumo reserva usa o modelo reserva geral', async () => {
      fetchMock.mockResolvedValueOnce(erro(429)).mockResolvedValueOnce(completion('resumo'));
      await make(RESERVA).complete(mensagens);
      expect(corpo(1).model).toBe('llama-reserva');
    });

    it('registra o consumo de tokens do provedor que respondeu', async () => {
      const usage = jest.fn();
      fetchMock.mockResolvedValueOnce(erro(429)).mockResolvedValueOnce(completion('resumo'));
      await make(RESERVA).complete(mensagens, 800, usage);
      expect(usage).toHaveBeenCalledWith({ promptTokens: 3, completionTokens: 2 });
    });

    it('sem reserva configurado mantém o erro de sempre', async () => {
      fetchMock.mockResolvedValueOnce(erro(503));
      await expect(make().complete(mensagens)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe('GroqService: modelo que respondeu e URL', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('informa o modelo principal quando ele responde', async () => {
    fetchMock.mockResolvedValueOnce(sse('ok'));
    const onStart = jest.fn();

    await ler(make(RESERVA).stream(mensagens, undefined, undefined, onStart));

    expect(onStart).toHaveBeenCalledWith({ model: 'openai/gpt-oss-120b', fallback: false });
  });

  it('informa que foi o reserva quando o principal falhou', async () => {
    fetchMock.mockResolvedValueOnce(erro(503)).mockResolvedValueOnce(sse('ok'));
    const onStart = jest.fn();

    await ler(make(RESERVA).stream(mensagens, undefined, undefined, onStart));

    expect(onStart).toHaveBeenCalledWith({ model: 'llama-reserva', fallback: true });
  });

  it('não informa nada quando nenhum provedor responde', async () => {
    fetchMock.mockResolvedValueOnce(erro(503)).mockResolvedValueOnce(erro(503));
    const onStart = jest.fn();

    await expect(ler(make(RESERVA).stream(mensagens, undefined, undefined, onStart))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('GROQ_URL troca o endereço do principal (proxy ou gateway)', async () => {
    fetchMock.mockResolvedValueOnce(sse('ok'));

    await ler(make({ GROQ_URL: 'http://gateway.local/v1/chat/completions' }).stream(mensagens));

    expect(fetchMock.mock.calls[0][0]).toBe('http://gateway.local/v1/chat/completions');
  });
});

describe('isRetryableStatus', () => {
  it('só 408, 429 e 5xx valem uma segunda tentativa', () => {
    expect([408, 429, 500, 503, 599].every(isRetryableStatus)).toBe(true);
    expect([200, 400, 401, 403, 404, 422].some(isRetryableStatus)).toBe(false);
  });
});
