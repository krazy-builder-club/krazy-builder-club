import type { z } from 'zod';

/** Model role, matching `model_runs.role`. */
export type ModelRole = 'librarian' | 'librarian_query';

export type ModelRequest<T extends z.ZodType> = {
  role: ModelRole;
  /** Fixed instructions. Customer content never goes here. */
  system: string;
  /** Untrusted customer content plus the task, as one user turn. */
  user: string;
  /** Validates the parsed JSON; its JSON Schema is also sent as the structured-output schema. */
  schema: T;
  maxOutputTokens: number;
  signal: AbortSignal;
};

export type ModelUsage = {
  inputTokens?: number;
  outputTokens?: number;
  providerRequestId?: string;
  durationMs: number;
};

/**
 * Raw structured output. `value` is parsed JSON, not yet validated: the caller validates it so an
 * invalid answer can be repaired once. Throws `ModelCallError` for provider/timeout failures.
 */
export type ModelResponse = { value: unknown; usage: ModelUsage };

export interface ModelClient {
  /** Provider model identifier, recorded on snapshots and model runs. */
  readonly model: string;
  generateJson<T extends z.ZodType>(request: ModelRequest<T>): Promise<ModelResponse>;
}

export class ModelCallError extends Error {
  constructor(
    readonly outcome: 'timeout' | 'provider_error' | 'invalid_output',
    message: string,
    readonly retryable: boolean,
    readonly usage?: ModelUsage,
  ) {
    super(message);
    this.name = 'ModelCallError';
  }
}
