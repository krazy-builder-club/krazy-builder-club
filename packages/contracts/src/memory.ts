import { z } from 'zod';

/** Canonical brain documents, rendered deterministically from structured memory. */
export const DocumentName = z.enum([
  'overview.md',
  'personality.md',
  'situation.md',
  'goals.md',
  'interactions.md',
]);
export type DocumentName = z.infer<typeof DocumentName>;

export const Dimension = z.enum(['personality', 'situation', 'goal', 'interaction']);
export type Dimension = z.infer<typeof Dimension>;

export const AssertionStatus = z.enum([
  'observed',
  'customer_confirmed',
  'inferred',
  'corrected',
  'retired',
]);
export type AssertionStatus = z.infer<typeof AssertionStatus>;

/**
 * Canonical matching tags. Personality and situation are separate vocabularies; extending them is
 * a shared-contract change (docs/data.md#references-and-pattern-evidence).
 */
export const PersonalityTag = z.enum([
  'budget_conscious',
  'prefers_self_service',
  'likes_planning',
  'travel_interested',
]);
export const SituationTag = z.enum(['renting', 'moving_soon', 'starting_new_job']);

export const EvidenceRef = z.strictObject({
  event_id: z.uuid(),
  /** Optional extraction span/page for file-derived evidence. */
  span: z.string().max(200).optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRef>;

export const Assertion = z.strictObject({
  id: z.string().min(1).max(100),
  dimension: Dimension,
  content: z.string().min(1).max(2000),
  tag: z.string().max(100).optional(),
  evidence: z.array(EvidenceRef).min(1),
  status: AssertionStatus,
  scope: z.string().max(200).optional(),
  observed_at: z.string().optional(),
  recorded_at: z.string(),
  review_after: z.string().optional(),
});
export type Assertion = z.infer<typeof Assertion>;

export const StructuredMemory = z.strictObject({
  schema_version: z.literal(1),
  assertions: z.array(Assertion),
});
export type StructuredMemory = z.infer<typeof StructuredMemory>;

export const ProfileSignature = z.strictObject({
  personality: z.array(PersonalityTag),
  situation: z.array(SituationTag),
});
export type ProfileSignature = z.infer<typeof ProfileSignature>;

/**
 * What the Librarian model may return. It cannot set workspace/customer authority, versions,
 * schedules or actions; code validates evidence and scope before applying.
 */
export const MemoryPatch = z.strictObject({
  base_version: z.number().int().nonnegative(),
  source_event_ids: z.array(z.uuid()).min(1),
  operations: z.array(
    z.discriminatedUnion('op', [
      z.strictObject({
        op: z.literal('upsert'),
        assertion: Assertion.omit({ recorded_at: true }),
        reason: z.string().min(1).max(1000),
      }),
      z.strictObject({
        op: z.literal('retire'),
        assertion_id: z.string().min(1).max(100),
        evidence: z.array(EvidenceRef).min(1),
        reason: z.string().min(1).max(1000),
      }),
    ]),
  ),
});
export type MemoryPatch = z.infer<typeof MemoryPatch>;
