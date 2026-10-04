import { Groq } from 'groq-sdk';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

let groqClient: Groq | null = null;
function getGroqClient(): Groq {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: env.GROQ_API_KEY.trim() });
  }
  return groqClient;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  max_tokens?: number;
  jsonMode?: boolean;
}

/**
 * Robust multi-provider chat completion:
 * 1. Tries Groq (openai/gpt-oss-120b)
 * 2. Falls back to Groq (qwen/qwen3.8-27b)
 * 3. Falls back to OpenRouter if configured
 */
export async function getAiCompletion(options: CompletionOptions): Promise<string> {
  const { messages, temperature = 0.2, jsonMode = false } = options;
  const maxTokens = options.maxTokens ?? options.max_tokens ?? 1200;

  // 1. Try Groq Primary (openai/gpt-oss-120b)
  if (env.GROQ_API_KEY) {
    try {
      const groq = getGroqClient();
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature,
        max_completion_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      });

      const reply = completion.choices[0]?.message?.content?.trim();
      if (reply) return reply;
    } catch (err: any) {
      console.warn('[aiCompletion] Groq primary model (openai/gpt-oss-120b) error:', err?.message || err);

      // 2. Try Groq Secondary (qwen/qwen3.8-27b)
      try {
        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
          model: 'qwen/qwen3.8-27b',
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature,
          max_completion_tokens: maxTokens,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        });

        const reply = completion.choices[0]?.message?.content?.trim();
        if (reply) return reply;
      } catch (secErr: any) {
        console.warn('[aiCompletion] Groq secondary model (qwen/qwen3.8-27b) error:', secErr?.message || secErr);
      }
    }
  }

  // 3. Fallback to OpenRouter if available
  if (env.OPENROUTER_API_KEY && !env.OPENROUTER_API_KEY.includes('invalid')) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY.trim()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://medinexus.app',
          'X-Title': 'mediNexus AI Service',
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free',
          messages,
          temperature,
          max_tokens: maxTokens,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        const reply = data?.choices?.[0]?.message?.content?.trim();
        if (reply) return reply;
      } else {
        const errText = await res.text();
        console.warn('[aiCompletion] OpenRouter error:', errText);
      }
    } catch (openRouterErr: any) {
      console.warn('[aiCompletion] OpenRouter fetch failed:', openRouterErr?.message || openRouterErr);
    }
  }

  throw new AppError('AI service is currently unavailable. Please try again shortly.', 502);
}
