import { createHmac, randomBytes } from 'node:crypto';

/**
 * Key format: `bob_<prefix>_<secret>`. The prefix (display/support handle) and secret are both
 * random; only HMAC-SHA256(pepper, full token) is stored, so a database leak yields no usable key.
 */
const TOKEN = /^bob_([a-z0-9]{10})_([A-Za-z0-9_-]{43})$/;

export function generateApiKey(pepper: string) {
  const prefix = randomBytes(8).toString('hex').slice(0, 10);
  const secret = randomBytes(32).toString('base64url');
  const token = `bob_${prefix}_${secret}`;
  return { token, prefix: `bob_${prefix}`, keyHash: hashApiKey(pepper, token) };
}

export function hashApiKey(pepper: string, token: string): string {
  return createHmac('sha256', pepper).update(token, 'utf8').digest('hex');
}

export const isWellFormedApiKey = (token: string) => TOKEN.test(token);
