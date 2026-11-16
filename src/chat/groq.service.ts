import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { estimateTokens, readUsage, TokenUsage } from './usage';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 30_000;

/** Erros que costumam passar sozinhos ou em outro provedor: limite estourado (429), tempo esgotado (408) e falha do servidor (5xx). */
export const isRetryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

interface Target {
  label: 'principal' | 'reserva';
  url: string;
  key: string;
  model: string;
}

@Injectable()
export class GroqService {
  private readonly logger = new Logger(GroqService.name);

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string {
    const key = this.config.get<string>('GROQ_API_KEY') ?? this.config.get<string>('API_KEY');

    if (!key) {
      throw new ServiceUnavailableException('GROQ_API_KEY não configurada.');
    }

    return key;
  }

  /**
   * Provedores na ordem de tentativa: o principal (Groq) e, se `LLM_FALLBACK_MODEL` estiver definido, um reserva.
   * O reserva usa a mesma API (compatível com OpenAI): por padrão a própria Groq com outro modelo, ou outro
   * provedor via `LLM_FALLBACK_URL` e `LLM_FALLBACK_API_KEY`.
   */
  private targets(primaryModel: string, fallbackModelKey: 'LLM_FALLBACK_MODEL' | 'LLM_FALLBACK_SUMMARY_MODEL'): Target[] {
    const key = this.apiKey;
    const targets: Target[] = [
      { label: 'principal', url: this.config.get<string>('GROQ_URL') || GROQ_URL, key, model: primaryModel },
    ];

    const fallbackModel =
      this.config.get<string>(fallbackModelKey) || this.config.get<string>('LLM_FALLBACK_MODEL');

    if (fallbackModel) {
      targets.push({
        label: 'reserva',
        url: this.config.get<string>('LLM_FALLBACK_URL') || GROQ_URL,
        key: this.config.get<string>('LLM_FALLBACK_API_KEY') || key,
        model: fallbackModel,
      });
    }

    return targets;
  }

  private get timeoutMs(): number {
    return Number(this.config.get('LLM_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS);
  }

  /**
   * Chama o primeiro provedor e, se ele estiver com problema (429, 5xx, rede ou tempo esgotado) e houver reserva,
   * repete uma vez no reserva. O aluno não percebe. Sem reserva, o comportamento é o de sempre (sem limite de tempo).
   * Só decide antes de a resposta começar: depois que o texto começa a chegar, não dá para trocar de provedor.
   */
  private async send(
    targets: Target[],
    makeBody: (model: string) => object,
    signal?: AbortSignal,
  ): Promise<{ response: Response; target: Target }> {
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const next = targets[i + 1];

      // O limite de tempo vale só até a resposta começar a chegar; depois disso o streaming segue sem corte
      const controller = next ? new AbortController() : null;
      let timedOut = false;
      const timer = controller
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, this.timeoutMs)
        : null;

      if (controller && signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      let response: Response;

      try {
        response = await fetch(target.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${target.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(makeBody(target.model)),
          signal: controller?.signal ?? signal,
        });
      } catch (error: any) {
        // O aluno cancelou a resposta: não é falha do provedor
        if (signal?.aborted) throw error;

        if (!next) {
          if (i === 0) throw error; // sem reserva: comportamento de sempre

          this.logger.error(`IA ${target.label} (${target.model}) também falhou: ${error.message}`);
          throw new ServiceUnavailableException('A IA está indisponível no momento.');
        }

        this.logger.warn(
          `IA ${target.label} (${target.model}) falhou: ${timedOut ? 'tempo esgotado' : error.message}; usando o reserva (${next.model})`,
        );
        continue;
      } finally {
        if (timer) clearTimeout(timer);
      }

      if (!response.ok && next && isRetryableStatus(response.status)) {
        this.logger.warn(`IA ${target.label} (${target.model}) respondeu ${response.status}; usando o reserva (${next.model})`);
        await response.body?.cancel().catch(() => undefined);
        continue;
      }

      return { response, target };
    }

    throw new ServiceUnavailableException('A IA está indisponível no momento.');
  }

  // Modelos gpt-oss "pensam" antes de responder; nível baixo gasta menos tokens
  private reasoning(model: string) {
    return model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {};
  }

  /**
   * Resposta em streaming: devolve os pedaços de texto conforme chegam.
   * `onUsage` recebe o consumo de tokens ao terminar (ou ser cancelado), estimado quando a API não informa.
   */
  async *stream(
    messages: LlmMessage[],
    signal?: AbortSignal,
    onUsage?: (usage: TokenUsage) => void,
    onStart?: (info: { model: string; fallback: boolean }) => void,
  ): AsyncGenerator<string> {
    const primaryModel = this.config.get<string>('GROQ_MODEL') ?? 'openai/gpt-oss-120b';

    const { response, target } = await this.send(
      this.targets(primaryModel, 'LLM_FALLBACK_MODEL'),
      (model) => ({
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: Number(this.config.get('GROQ_MAX_TOKENS') ?? 2048),
        temperature: 0.5,
        ...this.reasoning(model),
      }),
      signal,
    );

    if (!response.ok || !response.body) {
      this.logger.error(`Groq ${response.status}: ${await response.text()}`);
      throw new ServiceUnavailableException('A IA está indisponível no momento.');
    }

    onStart?.({ model: target.model, fallback: target.label === 'reserva' });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let reported: TokenUsage | null = null;
    let produced = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') return;

          let json: any;

          try {
            json = JSON.parse(data);
          } catch {
            continue; // linha parcial/inválida: ignora
          }

          reported = readUsage(json.usage ?? json.x_groq?.usage) ?? reported;

          const delta = json.choices?.[0]?.delta?.content;

          if (delta) {
            produced += delta;
            yield delta as string;
          }
        }
      }
    } finally {
      onUsage?.(
        reported ?? {
          promptTokens: estimateTokens(messages.map((m) => m.content).join('\n')),
          completionTokens: estimateTokens(produced),
        },
      );
    }
  }

  /** Resposta única, usada para resumir conversas (modelo menor e mais barato). */
  async complete(
    messages: LlmMessage[],
    maxTokens = 800,
    onUsage?: (usage: TokenUsage) => void,
  ): Promise<string> {
    const primaryModel = this.config.get<string>('GROQ_SUMMARY_MODEL') ?? 'openai/gpt-oss-20b';

    const { response } = await this.send(this.targets(primaryModel, 'LLM_FALLBACK_SUMMARY_MODEL'), (model) => ({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
      ...this.reasoning(model),
    }));

    if (!response.ok) {
      this.logger.error(`Groq ${response.status}: ${await response.text()}`);
      throw new ServiceUnavailableException('A IA está indisponível no momento.');
    }

    const json = await response.json();
    const text: string = json.choices?.[0]?.message?.content?.trim() ?? '';

    onUsage?.(
      readUsage(json.usage) ?? {
        promptTokens: estimateTokens(messages.map((m) => m.content).join('\n')),
        completionTokens: estimateTokens(text),
      },
    );

    return text;
  }
}
