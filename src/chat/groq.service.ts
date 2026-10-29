import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

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

  private request(body: object, signal?: AbortSignal) {
    return fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  }

  // Modelos gpt-oss "pensam" antes de responder; nível baixo gasta menos tokens
  private reasoning(model: string) {
    return model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {};
  }

  /** Resposta em streaming: devolve os pedaços de texto conforme chegam. */
  async *stream(messages: LlmMessage[], signal?: AbortSignal): AsyncGenerator<string> {
    const model = this.config.get<string>('GROQ_MODEL') ?? 'openai/gpt-oss-120b';

    const response = await this.request(
      {
        model,
        messages,
        stream: true,
        max_tokens: Number(this.config.get('GROQ_MAX_TOKENS') ?? 2048),
        temperature: 0.5,
        ...this.reasoning(model),
      },
      signal,
    );

    if (!response.ok || !response.body) {
      this.logger.error(`Groq ${response.status}: ${await response.text()}`);
      throw new ServiceUnavailableException('A IA está indisponível no momento.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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

        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta) yield delta as string;
        } catch {
          // linha parcial/inválida: ignora
        }
      }
    }
  }

  /** Resposta única, usada para resumir conversas (modelo menor e mais barato). */
  async complete(messages: LlmMessage[], maxTokens = 800): Promise<string> {
    const model = this.config.get<string>('GROQ_SUMMARY_MODEL') ?? 'openai/gpt-oss-20b';

    const response = await this.request({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
      ...this.reasoning(model),
    });

    if (!response.ok) {
      this.logger.error(`Groq ${response.status}: ${await response.text()}`);
      throw new ServiceUnavailableException('A IA está indisponível no momento.');
    }

    const json = await response.json();

    return json.choices?.[0]?.message?.content?.trim() ?? '';
  }
}
