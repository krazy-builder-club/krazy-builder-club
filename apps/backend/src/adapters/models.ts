import type { Env } from '../config/env.js';
import type { ModelClient } from '../modules/librarian/model.js';
import { OpenRouterModelClient } from './openrouter.js';

/**
 * Builds the two role clients from the validated environment. `undefined` means no provider is
 * configured: model jobs then stay queued instead of failing. Without an explicit
 * `MODEL_PROVIDER`, a present `OPENROUTER_API_KEY` (mounted from Secret Manager) selects it.
 */
export function createModelClients(
  env: Env,
): { librarian: ModelClient; query: ModelClient } | undefined {
  const provider = env.MODEL_PROVIDER ?? (env.OPENROUTER_API_KEY ? 'openrouter' : 'none');
  if (provider === 'none') return undefined;
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Invalid environment:\n  OPENROUTER_API_KEY: required when MODEL_PROVIDER=openrouter',
    );
  }
  return {
    librarian: new OpenRouterModelClient({ apiKey, model: env.LIBRARIAN_MODEL }),
    query: new OpenRouterModelClient({ apiKey, model: env.QUERY_MODEL }),
  };
}
