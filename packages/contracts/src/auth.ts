import { z } from 'zod';

/** API key capabilities (docs/data.md#authorization). Capabilities never broaden customer grants. */
export const Capability = z.enum([
  'customers:write',
  'sources:write',
  'data:read',
  'query:run',
  'insights:read',
  'feedback:write',
  'evaluate:run',
  'subscriptions:manage',
]);
export type Capability = z.infer<typeof Capability>;

export const ALL_CAPABILITIES = Capability.options;

/** `GET /v1/me`: what the presented key is allowed to do. Never includes the secret. */
export const KeyIdentityView = z.object({
  workspace_id: z.uuid(),
  key_id: z.uuid(),
  capabilities: z.array(Capability),
  all_customers: z.boolean(),
});
export type KeyIdentityView = z.infer<typeof KeyIdentityView>;
