import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from 'hono';
import { validationHook } from './errors.js';

/** Every module builds on this so validation failures render the shared envelope. */
export function createRouter<E extends Env>() {
  return new OpenAPIHono<E>({ defaultHook: validationHook });
}

export const BEARER_SCHEME = 'apiKey';
export const requiresApiKey = [{ [BEARER_SCHEME]: [] }];

/** Opaque base64url cursor over a JSON position; clients must not parse it. */
export const encodeCursor = (value: unknown) =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

export function decodeCursor<T>(
  cursor: string | undefined,
  parse: (v: unknown) => T,
): T | undefined {
  if (!cursor) return undefined;
  try {
    return parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    return undefined;
  }
}

export const iso = (d: Date) => d.toISOString();
