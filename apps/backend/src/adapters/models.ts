import type { Env } from '../config/env.js';
import type { ModelClient } from '../modules/librarian/model.js';
import { GeminiModelClient } from './gemini.js';

/**
 * Builds the two role clients from the validated environment. `undefined` means no provider is
 * configured: model jobs then stay queued instead of failing.
 */
export function createModelClients(
  env: Env,
): { librarian: ModelClient; query: ModelClient } | undefined {
  if (env.MODEL_PROVIDER === 'none') return undefined;
  if (env.MODEL_PROVIDER === 'vertex') {
    const project = env.GOOGLE_CLOUD_PROJECT;
    if (!project) {
      throw new Error(
        'Invalid environment:\n  GOOGLE_CLOUD_PROJECT: required when MODEL_PROVIDER=vertex',
      );
    }
    const location = env.GOOGLE_CLOUD_LOCATION;
    return {
      librarian: new GeminiModelClient({
        mode: 'vertex',
        project,
        location,
        model: env.LIBRARIAN_MODEL,
      }),
      query: new GeminiModelClient({ mode: 'vertex', project, location, model: env.QUERY_MODEL }),
    };
  }
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Invalid environment:\n  GEMINI_API_KEY: required when MODEL_PROVIDER=gemini_api',
    );
  }
  return {
    librarian: new GeminiModelClient({ mode: 'api_key', apiKey, model: env.LIBRARIAN_MODEL }),
    query: new GeminiModelClient({ mode: 'api_key', apiKey, model: env.QUERY_MODEL }),
  };
}
