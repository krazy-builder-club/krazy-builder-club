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
