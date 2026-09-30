import { OAuth2Client } from 'google-auth-library';
import type { MiddlewareHandler } from 'hono';

/** Verifies a Google-signed OIDC ID token and returns its service-account email, or undefined. */
export type IdTokenVerifier = (token: string, audience: string) => Promise<string | undefined>;

export function googleIdTokenVerifier(client = new OAuth2Client()): IdTokenVerifier {
  return async (token, audience) => {
    try {
      const ticket = await client.verifyIdToken({ idToken: token, audience });
      const payload = ticket.getPayload();
      return payload?.email && payload.email_verified ? payload.email : undefined;
    } catch {
      return undefined;
    }
  };
}

/**
 * Internal handlers accept only Cloud Scheduler/Tasks identities: a valid Google OIDC token for
 * this worker's audience from an allowlisted service account. Public API keys never apply here.
 */
export function requireInvoker(opts: {
  verify: IdTokenVerifier;
  audience: string;
  allowedEmails: readonly string[];
}): MiddlewareHandler {
  const allowed = new Set(opts.allowedEmails.map((e) => e.toLowerCase()));
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const email = token ? await opts.verify(token, opts.audience) : undefined;
    if (!email || !allowed.has(email.toLowerCase())) {
      return c.json(
        { error: { code: 'unauthenticated', message: 'Invoker identity required' } },
        401,
      );
    }
    return next();
  };
}
