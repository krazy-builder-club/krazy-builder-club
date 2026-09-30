import { z } from 'zod';
import {
  ModelCallError,
  type ModelClient,
  type ModelRequest,
  type ModelResponse,
} from '../modules/librarian/model.js';

/** Architecture's per-call model timeout. */
export const DEFAULT_MODEL_TIMEOUT_MS = 90_000;
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

type ChatCompletion = {
  id?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { code?: number | string };
};

export type OpenRouterOptions = {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
};

/**
 * Bounds that Google's structured-output endpoint rejects (verified live: `minItems`/`maxItems`
 * on the patch schema return 400 INVALID_ARGUMENT). They are dropped from the provider hint only;
 * the Zod schema still enforces every bound on the parsed output.
 */
const PROVIDER_UNSUPPORTED = new Set([
  '$schema',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
]);

/** Provider-friendly JSON Schema: nullable unions become plain optional fields. */
export function toProviderSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toProviderSchema);
  if (!node || typeof node !== 'object') return node;
  const object = node as Record<string, unknown>;
  if (Array.isArray(object.anyOf)) {
    const branches = (object.anyOf as Record<string, unknown>[]).filter((b) => b.type !== 'null');
    if (branches.length === 1) return toProviderSchema(branches[0]);
  }
  return Object.fromEntries(
    Object.entries(object)
      .filter(([key]) => !PROVIDER_UNSUPPORTED.has(key))
      .map(([key, value]) => [
        key,
        key === 'properties'
          ? Object.fromEntries(
              Object.entries(value as Record<string, unknown>).map(([k, v]) => [
                k,
                toProviderSchema(v),
              ]),
            )
          : toProviderSchema(value),
      ]),
  );
}

const responseSchema = (schema: z.ZodType) =>
  toProviderSchema(z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }));

/** Some models wrap JSON in a Markdown fence despite `response_format`; accept that shape only. */
function parseJson(text: string): unknown {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim());
  return JSON.parse(fenced?.[1] ?? text);
}

const retryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

/**
 * OpenRouter-backed `ModelClient` (OpenAI-compatible chat completions with a JSON-schema
 * response format). `require_parameters` keeps routing to providers that honor structured
 * output. Errors carry only the failure class and status: provider messages can echo prompt
 * content, so they are never copied into `ModelCallError`, and the key is never logged.
 */
export class OpenRouterModelClient implements ModelClient {
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;

  constructor(options: OpenRouterOptions) {
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_MODEL_TIMEOUT_MS;
    this.fetch = options.fetch ?? fetch;
  }

  async generateJson<T extends z.ZodType>(request: ModelRequest<T>): Promise<ModelResponse> {
    const started = Date.now();
    const elapsed = () => ({ durationMs: Date.now() - started });
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(this.timeoutMs)]);

    let body: ChatCompletion;
    try {
      const response = await this.fetch(OPENROUTER_URL, {
        method: 'POST',
        signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          'x-title': 'BOB Librarian',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: request.role,
              strict: false,
              schema: responseSchema(request.schema),
            },
          },
          provider: { require_parameters: true },
          max_tokens: request.maxOutputTokens,
          // Reasoning tokens count against max_tokens; low effort leaves room for the JSON.
          reasoning: { effort: 'low' },
          temperature: 0.2,
        }),
      });
      if (!response.ok) {
        throw new ModelCallError(
          'provider_error',
          `model provider HTTP ${response.status}`,
          retryableStatus(response.status),
          elapsed(),
        );
      }
      body = (await response.json()) as ChatCompletion;
    } catch (error) {
      if (error instanceof ModelCallError) throw error;
      if (signal.aborted) {
        throw new ModelCallError('timeout', 'model call aborted or timed out', true, elapsed());
      }
      throw new ModelCallError('provider_error', 'model provider network error', true, elapsed());
    }

    const usage = {
      inputTokens: body.usage?.prompt_tokens,
      outputTokens: body.usage?.completion_tokens,
      providerRequestId: body.id,
      ...elapsed(),
    };
    // OpenRouter can report an upstream failure inside a 200 body.
    if (body.error) {
      const status = typeof body.error.code === 'number' ? body.error.code : 502;
      throw new ModelCallError(
        'provider_error',
        `model provider error ${status}`,
        retryableStatus(status),
        usage,
      );
    }
    const choice = body.choices?.[0];
    const finish = choice?.finish_reason;
    if (finish && finish !== 'stop') {
      // length (truncated JSON), content_filter, etc.: no usable structured output.
      throw new ModelCallError('invalid_output', `model finished with ${finish}`, false, usage);
    }
    const text = choice?.message?.content;
    if (!text?.trim()) {
      throw new ModelCallError('invalid_output', 'model returned empty output', false, usage);
    }
    try {
      return { value: parseJson(text), usage };
    } catch {
      throw new ModelCallError('invalid_output', 'model output was not valid JSON', false, usage);
    }
  }
}
