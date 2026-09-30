import { z } from 'zod';
import { DataKind } from './common.js';
import { CandidateNeed, InsightKind, ProposedAction } from './insights.js';

export const Weekday = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

export const SubscriptionState = z.enum(['pending_verification', 'active', 'paused', 'disabled']);

export const CustomerScope = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('all_active') }),
  z.strictObject({ mode: z.literal('explicit'), customer_ids: z.array(z.uuid()).min(1).max(1000) }),
]);

export const CreateSubscription = z.strictObject({
  customer_scope: CustomerScope,
  schedule: z.strictObject({
    frequency: z.literal('weekly'),
    weekday: Weekday.default('monday'),
    local_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default('09:00'),
    timezone: z.string().min(1).max(64),
  }),
  webhook_url: z.url({ protocol: /^https$/ }),
});
export type CreateSubscription = z.infer<typeof CreateSubscription>;

export const WEBHOOK_HEADERS = {
  deliveryId: 'X-BOB-Delivery-Id',
  timestamp: 'X-BOB-Timestamp',
  signature: 'X-BOB-Signature',
} as const;

/** Frozen `insight.created` body (docs/api.md#webhook-contract). */
export const InsightCreatedWebhook = z.object({
  schema_version: z.literal('1'),
  delivery_id: z.uuid(),
  event_type: z.literal('insight.created'),
  occurred_at: z.string(),
  subscription_id: z.uuid(),
  customer_id: z.uuid(),
  review_id: z.uuid(),
  insight: z.object({
    id: z.uuid(),
    kind: InsightKind.exclude(['no_action']),
    candidate_need: CandidateNeed,
    proposed_action: ProposedAction,
    explanation: z.string(),
    evidence_event_ids: z.array(z.uuid()),
    brain_version: z.number().int(),
    data_kind: DataKind,
  }),
});
export type InsightCreatedWebhook = z.infer<typeof InsightCreatedWebhook>;
