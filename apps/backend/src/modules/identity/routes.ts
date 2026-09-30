import { ALL_CAPABILITIES, KeyIdentityView } from '@bob/contracts';
import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors.js';
import { createRouter, requiresApiKey } from '../../lib/router.js';
import type { AppEnv } from './auth.js';

export function identityRoutes() {
  const app = createRouter<AppEnv>();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/me',
      tags: ['identity'],
      summary: 'What the presented key may do (capabilities and customer scope); never the secret',
      security: requiresApiKey,
      responses: {
        200: {
          description: 'Key identity',
          content: { 'application/json': { schema: KeyIdentityView } },
        },
        ...errorResponses(401, 429),
      },
    }),
    (c) => {
      const auth = c.get('auth');
      return c.json(
        {
          workspace_id: auth.workspaceId,
          key_id: auth.keyId,
          // Stable contract order rather than set-insertion order.
          capabilities: ALL_CAPABILITIES.filter((capability) => auth.capabilities.has(capability)),
          all_customers: auth.grant.allCustomers,
        },
        200,
      );
    },
  );

  return app;
}
