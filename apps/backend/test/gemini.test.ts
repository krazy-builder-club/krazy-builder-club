import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GeminiModelClient, type GeminiSdk } from '../src/adapters/gemini.js';
import { createModelClients } from '../src/adapters/models.js';
import { assertWorkerEnv, loadEnv } from '../src/config/env.js';
import { ModelCallError } from '../src/modules/librarian/model.js';

const schema = z.object({ answer: z.string() });

type Params = Parameters<GeminiSdk['models']['generateContent']>[0];

function fake(result: () => unknown) {
  const calls: Params[] = [];
  const sdk = {
    models: {
      generateContent: async (params: Params) => {
        calls.push(params);
        return result();
      },
    },
  } as unknown as GeminiSdk;
  return { sdk, calls };
}

function request(signal = new AbortController().signal) {
  return {
    role: 'librarian' as const,
    system: 'SYSTEM',
    user: 'USER SECRET',
    schema,
    maxOutputTokens: 256,
    signal,
  };
}

async function failure(promise: Promise<unknown>): Promise<ModelCallError> {
  const error = await promise.then(
    () => undefined,
    (e) => e,
  );
  expect(error).toBeInstanceOf(ModelCallError);
  return error as ModelCallError;
}

describe('GeminiModelClient', () => {
  it('parses JSON, maps usage and sends the structured-output request', async () => {
    const { sdk, calls } = fake(() => ({
      text: '{"answer":"hi"}',
      responseId: 'req-1',
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 5 },
    }));
    const client = new GeminiModelClient({ mode: 'api_key', apiKey: 'k', model: 'm', sdk });
    const out = await client.generateJson(request());
    expect(out.value).toEqual({ answer: 'hi' });
    expect(out.usage).toMatchObject({
      inputTokens: 11,
      outputTokens: 5,
      providerRequestId: 'req-1',
    });
    expect(out.usage.durationMs).toBeGreaterThanOrEqual(0);

    const call = calls[0] as Params;
    expect(call.model).toBe('m');
    expect(call.contents).toEqual([{ role: 'user', parts: [{ text: 'USER SECRET' }] }]);
    expect(call.config).toMatchObject({
      systemInstruction: 'SYSTEM',
      responseMimeType: 'application/json',
      maxOutputTokens: 256,
      temperature: 0.2,
    });
    const jsonSchema = call.config.responseJsonSchema as Record<string, unknown>;
    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema).not.toHaveProperty('$schema');
    expect(call.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['non-JSON text', { text: 'nope', candidates: [{ finishReason: 'STOP' }] }],
    ['empty text', { text: '', candidates: [{ finishReason: 'STOP' }] }],
    ['truncated output', { text: '{"answer"', candidates: [{ finishReason: 'MAX_TOKENS' }] }],
    ['safety stop', { text: undefined, candidates: [{ finishReason: 'SAFETY' }] }],
    ['blocked prompt', { promptFeedback: { blockReason: 'SAFETY' } }],
  ])('%s is a non-retryable invalid_output', async (_name, response) => {
    const { sdk } = fake(() => ({ ...response, usageMetadata: { promptTokenCount: 3 } }));
    const client = new GeminiModelClient({ mode: 'api_key', apiKey: 'k', model: 'm', sdk });
    const error = await failure(client.generateJson(request()));
    expect(error.outcome).toBe('invalid_output');
    expect(error.retryable).toBe(false);
    expect(error.usage?.inputTokens).toBe(3);
  });

  it('maps a caller abort to a retryable timeout', async () => {
    const controller = new AbortController();
    const { sdk } = fake(() => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    controller.abort();
    const client = new GeminiModelClient({ mode: 'api_key', apiKey: 'k', model: 'm', sdk });
    const error = await failure(client.generateJson(request(controller.signal)));
    expect(error).toMatchObject({ outcome: 'timeout', retryable: true });
  });

  it('times out a hung call', async () => {
    const sdk = {
      models: {
        generateContent: (params: Params) =>
          new Promise((_resolve, reject) => {
            (params.config.abortSignal as AbortSignal).addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          }),
      },
    } as unknown as GeminiSdk;
    const client = new GeminiModelClient({
      mode: 'api_key',
      apiKey: 'k',
      model: 'm',
      sdk,
      timeoutMs: 20,
    });
    const error = await failure(client.generateJson(request()));
    expect(error).toMatchObject({ outcome: 'timeout', retryable: true });
  });

  it.each([
    [429, true],
    [503, true],
    [400, false],
    [403, false],
  ])(
    'HTTP %i is provider_error retryable=%s without leaking content',
    async (status, retryable) => {
      const { sdk } = fake(() => {
        throw Object.assign(new Error('echoed USER SECRET'), { status });
      });
      const client = new GeminiModelClient({ mode: 'api_key', apiKey: 'k', model: 'm', sdk });
      const error = await failure(client.generateJson(request()));
      expect(error).toMatchObject({ outcome: 'provider_error', retryable });
      expect(error.message).not.toContain('SECRET');
    },
  );

  it('treats a status-less failure as a retryable network error', async () => {
    const { sdk } = fake(() => {
      throw new Error('ECONNRESET');
    });
    const client = new GeminiModelClient({ mode: 'api_key', apiKey: 'k', model: 'm', sdk });
    const error = await failure(client.generateJson(request()));
    expect(error).toMatchObject({ outcome: 'provider_error', retryable: true });
  });
});

describe('createModelClients', () => {
  const base = {
    DATABASE_URL: 'postgres://u:p@localhost:5432/bob',
    API_KEY_PEPPER: 'x'.repeat(32),
    WORKER_LOCAL_DRIVER: 'true',
  };

  it('returns undefined when no provider is configured', () => {
    expect(createModelClients(loadEnv(base))).toBeUndefined();
  });

  it('requires a project for vertex and a key for gemini_api', () => {
    expect(() => createModelClients(loadEnv({ ...base, MODEL_PROVIDER: 'vertex' }))).toThrow(
      /GOOGLE_CLOUD_PROJECT/,
    );
    expect(() => createModelClients(loadEnv({ ...base, MODEL_PROVIDER: 'gemini_api' }))).toThrow(
      /GEMINI_API_KEY/,
    );
  });

  it('builds separately configured role clients', () => {
    const clients = createModelClients(
      loadEnv({
        ...base,
        MODEL_PROVIDER: 'vertex',
        GOOGLE_CLOUD_PROJECT: 'p',
        QUERY_MODEL: 'other-model',
      }),
    );
    expect(clients?.librarian.model).toBe('gemini-3.5-flash');
    expect(clients?.query.model).toBe('other-model');
  });

  it('rejects gemini_api in production', () => {
    const env = loadEnv({
      ...base,
      NODE_ENV: 'production',
      WORKER_LOCAL_DRIVER: 'false',
      WORKER_OIDC_AUDIENCE: 'https://w',
      WORKER_INVOKER_EMAILS: 'a@b.c',
      MODEL_PROVIDER: 'gemini_api',
      GEMINI_API_KEY: 'k',
    });
    expect(() => assertWorkerEnv(env)).toThrow(/gemini_api/);
  });
});
