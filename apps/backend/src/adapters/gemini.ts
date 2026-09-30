import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import {
  ModelCallError,
  type ModelClient,
  type ModelRequest,
  type ModelResponse,
} from '../modules/librarian/model.js';

/** Architecture's per-call model timeout. */
export const DEFAULT_MODEL_TIMEOUT_MS = 90_000;

/** The slice of `GoogleGenAI` this adapter uses; tests inject a fake. */
export type GeminiSdk = {
  models: {
    generateContent(params: {
      model: string;
      contents: unknown;
      config: Record<string, unknown>;
    }): Promise<GeminiResponse>;
  };
};

type GeminiResponse = {
  text?: string;
  responseId?: string;
  candidates?: { finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

export type GeminiOptions = (
  | { mode: 'vertex'; project: string; location: string; model: string }
  // Local-development convenience for synthetic data only; deployed runs use Vertex with ADC.
  | { mode: 'api_key'; apiKey: string; model: string }
) & {
  timeoutMs?: number;
  /** Injected SDK for tests; otherwise built from `mode`. */
  sdk?: GeminiSdk;
};

function createSdk(options: GeminiOptions): GeminiSdk {
  // Vertex uses Application Default Credentials (the runtime service account in Cloud Run).
  const ai =
    options.mode === 'vertex'
      ? new GoogleGenAI({ vertexai: true, project: options.project, location: options.location })
      : new GoogleGenAI({ apiKey: options.apiKey });
  return ai as unknown as GeminiSdk;
}

/** Gemini accepts plain JSON Schema but not the `$schema` meta key Zod emits. */
function toResponseSchema(schema: z.ZodType): unknown {
  const { $schema: _meta, ...rest } = z.toJSONSchema(schema, {
    target: 'draft-7',
    io: 'input',
  }) as Record<string, unknown>;
  return rest;
}

function httpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Gemini-backed `ModelClient`. Errors carry only the failure class and HTTP status: provider
 * messages can echo prompt content, so they are never copied into `ModelCallError`.
 */
export class GeminiModelClient implements ModelClient {
  readonly model: string;
  private readonly sdk: GeminiSdk;
  private readonly timeoutMs: number;

  constructor(options: GeminiOptions) {
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_MODEL_TIMEOUT_MS;
    this.sdk = options.sdk ?? createSdk(options);
  }

  async generateJson<T extends z.ZodType>(request: ModelRequest<T>): Promise<ModelResponse> {
    const started = Date.now();
    const elapsed = () => ({ durationMs: Date.now() - started });
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = AbortSignal.any([request.signal, timeout]);

    let response: GeminiResponse;
    try {
      response = await this.sdk.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: request.user }] }],
        config: {
          systemInstruction: request.system,
          responseMimeType: 'application/json',
          responseJsonSchema: toResponseSchema(request.schema),
          maxOutputTokens: request.maxOutputTokens,
          temperature: 0.2,
          abortSignal: signal,
        },
      });
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new ModelCallError('timeout', 'model call aborted or timed out', true, elapsed());
      }
      const status = httpStatus(error);
      if (status === undefined) {
        throw new ModelCallError('provider_error', 'model provider network error', true, elapsed());
      }
      const retryable = status === 429 || status >= 500;
      throw new ModelCallError(
        'provider_error',
        `model provider HTTP ${status}`,
        retryable,
        elapsed(),
      );
    }

    const usage = {
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
      providerRequestId: response.responseId,
      ...elapsed(),
    };

    const blocked = response.promptFeedback?.blockReason;
    if (blocked) {
      throw new ModelCallError('invalid_output', `model prompt blocked: ${blocked}`, false, usage);
    }
    const finish = response.candidates?.[0]?.finishReason;
    if (finish && finish !== 'STOP') {
      // SAFETY, MAX_TOKENS (truncated JSON), RECITATION, etc.: no usable structured output.
      throw new ModelCallError('invalid_output', `model finished with ${finish}`, false, usage);
    }
    const text = response.text;
    if (!text?.trim()) {
      throw new ModelCallError('invalid_output', 'model returned empty output', false, usage);
    }
    try {
      return { value: JSON.parse(text), usage };
    } catch {
      throw new ModelCallError('invalid_output', 'model output was not valid JSON', false, usage);
    }
  }
}
