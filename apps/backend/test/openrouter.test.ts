import { MemoryPatch } from '@bob/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createModelClients } from '../src/adapters/models.js';
import {
  OPENROUTER_URL,
  OpenRouterModelClient,
  toProviderSchema,
} from '../src/adapters/openrouter.js';
import { loadEnv } from '../src/config/env.js';
import { ModelCallError } from '../src/modules/librarian/model.js';

const schema = z.object({ answer: z.string() });

type Call = { url: string; init: RequestInit };

/** Fake fetch returning `respond()` as the HTTP response and recording each call. */
function fakeFetch(respond: (init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return respond(init);
  }) as typeof fetch;
  return { impl, calls };
}

const completion = (content: string | null, extra: Record<string, unknown> = {}) =>
  Response.json({
    id: 'gen-1',
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 11, completion_tokens: 5 },
    ...extra,
  });

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

const client = (impl: typeof fetch, timeoutMs?: number) =>
  new OpenRouterModelClient({ apiKey: 'sk-test', model: 'google/test', fetch: impl, timeoutMs });

describe('OpenRouterModelClient', () => {
  it('sends a structured-output chat request and maps usage', async () => {
    const { impl, calls } = fakeFetch(() => completion('{"answer":"hi"}'));
    const out = await client(impl).generateJson(request());
    expect(out.value).toEqual({ answer: 'hi' });
    expect(out.usage).toMatchObject({
      inputTokens: 11,
      outputTokens: 5,
      providerRequestId: 'gen-1',
    });

    const call = calls[0];
    expect(call?.url).toBe(OPENROUTER_URL);
    expect((call?.init.headers as Record<string, string> | undefined)?.authorization).toBe(
      'Bearer sk-test',
    );
    const body = JSON.parse(String(call?.init.body));
    expect(body).toMatchObject({
      model: 'google/test',
      max_tokens: 256,
      provider: { require_parameters: true },
      messages: [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'USER SECRET' },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'librarian' } },
    });
    expect(body.response_format.json_schema.schema.properties.answer).toBeDefined();
    expect(body.response_format.json_schema.schema.$schema).toBeUndefined();
  });

  it('accepts fenced JSON but rejects prose, truncation and empty output', async () => {
    const fenced = fakeFetch(() => completion('```json\n{"answer":"x"}\n```'));
    expect((await client(fenced.impl).generateJson(request())).value).toEqual({ answer: 'x' });

    for (const response of [
      () => completion('not json'),
      () => completion(null),
      () => Response.json({ choices: [{ message: { content: '{"a' }, finish_reason: 'length' }] }),
    ]) {
      const error = await failure(client(fakeFetch(response).impl).generateJson(request()));
      expect(error).toMatchObject({ outcome: 'invalid_output', retryable: false });
    }
  });

  it('classifies provider errors without echoing provider text', async () => {
    const cases: [Response, boolean][] = [
      [new Response('rate limited: USER SECRET', { status: 429 }), true],
      [new Response('boom', { status: 503 }), true],
      [new Response('bad key', { status: 401 }), false],
      [Response.json({ error: { code: 502, message: 'upstream USER SECRET' } }), true],
    ];
    for (const [response, retryable] of cases) {
      const error = await failure(client(fakeFetch(() => response).impl).generateJson(request()));
      expect(error).toMatchObject({ outcome: 'provider_error', retryable });
      expect(error.message).not.toContain('SECRET');
    }
    const network = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    expect(await failure(client(network.impl).generateJson(request()))).toMatchObject({
      outcome: 'provider_error',
      retryable: true,
    });
  });

  it('turns caller aborts and hung calls into retryable timeouts', async () => {
    const hang = fakeFetch(
      (init) =>
        new Promise<Response>((_, reject) => {
          // Like real fetch: an already-aborted signal rejects at once.
          if (init.signal?.aborted) reject(new Error('aborted'));
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    expect(await failure(client(hang.impl, 20).generateJson(request()))).toMatchObject({
      outcome: 'timeout',
      retryable: true,
    });
    const controller = new AbortController();
    controller.abort();
    expect(await failure(client(hang.impl).generateJson(request(controller.signal)))).toMatchObject(
      { outcome: 'timeout' },
    );
  });
});

describe('toProviderSchema', () => {
  it('drops bounds Google rejects and flattens nullable unions, keeping structure', () => {
    const schema = toProviderSchema(z.toJSONSchema(MemoryPatch, { target: 'draft-7' }));
    const text = JSON.stringify(schema);
    for (const key of ['minItems', 'maxItems', 'exclusiveMinimum', 'maximum', '"$schema"']) {
      expect(text).not.toContain(key);
    }
    expect(text).not.toContain('"null"');
    const op = (schema as { properties: { operations: { items: Record<string, unknown> } } })
      .properties.operations.items;
    expect(op).toMatchObject({ required: expect.arrayContaining(['op', 'evidence', 'reason']) });
    expect((op.properties as Record<string, unknown>).kind).toMatchObject({ type: 'string' });
  });
});

describe('createModelClients', () => {
  const base = {
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    API_KEY_PEPPER: 'x'.repeat(32),
  };

  it('stays unconfigured without a key, and selects OpenRouter when a key is present', () => {
    expect(createModelClients(loadEnv(base))).toBeUndefined();
    const clients = createModelClients(
      loadEnv({
        ...base,
        OPENROUTER_API_KEY: 'sk-or-x',
        QUERY_MODEL: 'anthropic/claude-haiku-4.5',
      }),
    );
    expect(clients?.librarian.model).toBe('google/gemini-3.8-flash');
    expect(clients?.query.model).toBe('anthropic/claude-haiku-4.5');
  });

  it('honors an explicit none and requires a key for openrouter', () => {
    expect(
      createModelClients(loadEnv({ ...base, MODEL_PROVIDER: 'none', OPENROUTER_API_KEY: 'k' })),
    ).toBeUndefined();
    expect(() => createModelClients(loadEnv({ ...base, MODEL_PROVIDER: 'openrouter' }))).toThrow(
      /OPENROUTER_API_KEY/,
    );
  });
});
