import { z } from 'zod';
import { UtcInstant } from './common.js';

/**
 * Customer memory ("brain") contract, ADR 0008. Memory is organized by what describes the person:
 *
 * - Situation: what is true in their life now, plus goals/intent (what they want next).
 * - Personality: how they tend to choose, act and prefer to be helped.
 * - Experience: what has happened to them and what they learned.
 *
 * Structured assertions are canonical; the Markdown documents below are rendered from them
 * deterministically. Paths are logical names stored in the database, not physical files.
 */
export const MEMORY_SCHEMA_VERSION = 2;

export const DocumentPath = z.enum([
  'overview.md',
  'situation/current.md',
  'situation/goals.md',
  'personality/preferences.md',
  'personality/communication.md',
  'experience/history.md',
  'experience/interactions.md',
  'evidence/sources.md',
]);
export type DocumentPath = z.infer<typeof DocumentPath>;

/** Folder view of the brain, in display order. */
export const BRAIN_TREE: readonly { folder: string; documents: readonly DocumentPath[] }[] = [
  { folder: '', documents: ['overview.md'] },
  { folder: 'situation/', documents: ['situation/current.md', 'situation/goals.md'] },
  {
    folder: 'personality/',
    documents: ['personality/preferences.md', 'personality/communication.md'],
  },
  { folder: 'experience/', documents: ['experience/history.md', 'experience/interactions.md'] },
  { folder: 'evidence/', documents: ['evidence/sources.md'] },
];

export const Category = z.enum(['situation', 'goal', 'personality', 'experience']);
export type Category = z.infer<typeof Category>;

/** What kind of statement an assertion is. The kind fixes its category and document. */
export const AssertionKind = z.enum([
  // situation: current circumstances, commitments, constraints, active transitions
  'circumstance',
  'commitment',
  'constraint',
  'transition',
  // goals and intent
  'goal',
  // personality: contextual preferences, values, decision habits, communication
  'preference',
  'value',
  'decision_habit',
  'communication',
  // experience: significant events, previous decisions, outcomes, service interactions/feedback
  'life_event',
  'decision',
  'outcome',
  'interaction',
  'feedback',
]);
export type AssertionKind = z.infer<typeof AssertionKind>;

export const KIND_PLACEMENT: Record<AssertionKind, { category: Category; document: DocumentPath }> =
  {
    circumstance: { category: 'situation', document: 'situation/current.md' },
    commitment: { category: 'situation', document: 'situation/current.md' },
    constraint: { category: 'situation', document: 'situation/current.md' },
    transition: { category: 'situation', document: 'situation/current.md' },
    goal: { category: 'goal', document: 'situation/goals.md' },
    preference: { category: 'personality', document: 'personality/preferences.md' },
    value: { category: 'personality', document: 'personality/preferences.md' },
    decision_habit: { category: 'personality', document: 'personality/preferences.md' },
    communication: { category: 'personality', document: 'personality/communication.md' },
    life_event: { category: 'experience', document: 'experience/history.md' },
    decision: { category: 'experience', document: 'experience/history.md' },
    outcome: { category: 'experience', document: 'experience/history.md' },
    interaction: { category: 'experience', document: 'experience/interactions.md' },
    feedback: { category: 'experience', document: 'experience/interactions.md' },
  };

/** Assertion ID prefix per category: `s_001`, `g_002`, `p_003`, `x_004`. */
export const CATEGORY_PREFIX: Record<Category, string> = {
  situation: 's',
  goal: 'g',
  personality: 'p',
  experience: 'x',
};

/** Life area: the secondary dimension used for Markdown headings within a document. */
export const LifeArea = z.enum([
  'home',
  'work',
  'household',
  'finances',
  'banking',
  'health',
  'mobility',
  'education',
  'leisure',
  'other',
]);
export type LifeArea = z.infer<typeof LifeArea>;

/**
 * Support for a statement: `customer_confirmed` (the customer said/confirmed it), `observed`
 * (seen in supplied data such as transactions), `inferred` (an interpretation, never a fact),
 * `corrected` (changed by a customer correction), `retired` (no longer true; kept as history).
 */
export const AssertionStatus = z.enum([
  'observed',
  'customer_confirmed',
  'inferred',
  'corrected',
  'retired',
]);
export type AssertionStatus = z.infer<typeof AssertionStatus>;

export const GoalState = z.enum(['open', 'in_progress', 'achieved', 'abandoned']);
export type GoalState = z.infer<typeof GoalState>;

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

const IsoDate = z.iso.date();
export const AssertionId = z.string().regex(/^[sgpx]_\d{3,}$/);

/** A reference to one source event of this customer. `sequence` is the per-customer number. */
export const EvidenceRef = z.strictObject({
  event_id: z.uuid(),
  sequence: z.number().int().positive(),
  /** Optional extraction span/page for file-derived evidence. */
  span: z.string().max(200).optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRef>;

export const Assertion = z.strictObject({
  id: AssertionId,
  kind: AssertionKind,
  area: LifeArea,
  statement: z.string().min(1).max(500),
  status: AssertionStatus,
  evidence: z.array(EvidenceRef).min(1),
  /** Canonical tag from the category's vocabulary (personality/situation only). */
  tag: z.string().max(100).optional(),
  /** Where the statement applies, e.g. "routine banking". Keeps preferences contextual. */
  context: z.string().max(200).optional(),
  valid_from: IsoDate.optional(),
  valid_until: IsoDate.optional(),
  review_after: IsoDate.optional(),
  goal_state: GoalState.optional(),
  target_date: IsoDate.optional(),
  related_ids: z.array(AssertionId).max(20).optional(),
  recorded_at: UtcInstant,
  updated_at: UtcInstant,
  retired_at: UtcInstant.optional(),
  retired_reason: z.string().max(500).optional(),
});
export type Assertion = z.infer<typeof Assertion>;

/** Ledger entry for one incorporated source event. Raw payloads stay in `source_events`. */
export const EvidenceSource = z.strictObject({
  event_id: z.uuid(),
  sequence: z.number().int().positive(),
  event_type: z.string(),
  source: z.string(),
  occurred_at: UtcInstant,
  received_at: UtcInstant,
  corrects_event_id: z.uuid().nullable(),
});
export type EvidenceSource = z.infer<typeof EvidenceSource>;

export const StructuredMemory = z.strictObject({
  schema_version: z.literal(MEMORY_SCHEMA_VERSION),
  /** Short generated summary shown in overview.md; never a place where facts are maintained. */
  summary: z.string().max(1000),
  /** Next numeric suffix for server-assigned assertion IDs. */
  next_id: z.number().int().positive(),
  assertions: z.array(Assertion),
  evidence: z.array(EvidenceSource),
});
export type StructuredMemory = z.infer<typeof StructuredMemory>;

export const ProfileSignature = z.strictObject({
  personality: z.array(PersonalityTag),
  situation: z.array(SituationTag),
});
export type ProfileSignature = z.infer<typeof ProfileSignature>;

const nullish = <T extends z.ZodType>(schema: T) => schema.nullish();

/**
 * What the Librarian model returns. Flat on purpose (provider structured-output support for
 * unions varies); code validates each operation's required fields, evidence and scope before
 * applying. Evidence is cited by per-customer source sequence number. The model cannot set
 * workspace/customer authority, IDs of new assertions, versions, schedules or actions.
 */
export const MemoryOperation = z.strictObject({
  op: z.enum(['add', 'update', 'retire']),
  /** Existing assertion ID for `update`/`retire`. */
  id: nullish(z.string().max(20)),
  /** Temporary name for an `add`, so other operations in this patch can relate to it. */
  key: nullish(z.string().max(40)),
  kind: nullish(AssertionKind),
  area: nullish(LifeArea),
  statement: nullish(z.string().max(500)),
  status: nullish(AssertionStatus.exclude(['retired'])),
  evidence: z.array(z.number().int().positive()).min(1).max(50),
  tag: nullish(z.string().max(100)),
  context: nullish(z.string().max(200)),
  valid_from: nullish(z.string().max(40)),
  valid_until: nullish(z.string().max(40)),
  review_after: nullish(z.string().max(40)),
  goal_state: nullish(GoalState),
  target_date: nullish(z.string().max(40)),
  related: nullish(z.array(z.string().max(40)).max(20)),
  reason: z.string().min(1).max(1000),
});
export type MemoryOperation = z.infer<typeof MemoryOperation>;

export const MemoryPatch = z.strictObject({
  summary: nullish(z.string().max(1000)),
  operations: z.array(MemoryOperation).max(60),
});
export type MemoryPatch = z.infer<typeof MemoryPatch>;

/** Librarian job result, visible through `GET /v1/jobs/{id}`. */
export const LibrarianResult = z.object({
  brain_version: z.number().int(),
  source_watermark: z.number().int(),
  incorporated_event_ids: z.array(z.uuid()),
  operations: z.object({ added: z.number(), updated: z.number(), retired: z.number() }),
  has_pending_sources: z.boolean(),
  /** True when an earlier job already incorporated this job's event. */
  already_incorporated: z.boolean(),
});
export type LibrarianResult = z.infer<typeof LibrarianResult>;

export const BrainView = z.object({
  customer_id: z.uuid(),
  version: z.number().int(),
  schema_version: z.number().int(),
  source_watermark: z.number().int(),
  current_source_revision: z.number().int(),
  has_pending_sources: z.boolean(),
  created_at: z.string(),
  tree: z.array(z.object({ folder: z.string(), documents: z.array(DocumentPath) })),
  documents: z.record(z.string(), z.string()),
  structured: StructuredMemory,
  signature: ProfileSignature,
});
export type BrainView = z.infer<typeof BrainView>;

// --- Grounded read-only questions ---

export const QueryRequest = z.strictObject({
  question: z.string().trim().min(1).max(2000),
  /** Optionally hold the request open (up to 25 s) until the answer is ready. */
  wait_seconds: z.number().int().min(0).max(25).default(0),
});
export type QueryRequest = z.infer<typeof QueryRequest>;

/** `202` body of `POST /v1/customers/{id}/query`: poll `GET /v1/jobs/{job_id}` for the answer. */
export const QueryAccepted = z.object({
  job_id: z.uuid(),
  status: z.literal('queued'),
  brain_version: z.number().int(),
});
export type QueryAccepted = z.infer<typeof QueryAccepted>;

/** What the query model returns; citations are validated against the captured brain. */
export const QueryModelOutput = z.strictObject({
  answer: z.string().min(1).max(4000),
  answerable: z.boolean(),
  assertion_ids: z.array(z.string().max(20)).max(50),
  evidence: z.array(z.number().int().positive()).max(50),
  uncertainties: z.array(z.string().max(500)).max(10),
});
export type QueryModelOutput = z.infer<typeof QueryModelOutput>;

export const QueryResult = z.object({
  question: z.string(),
  answer: z.string(),
  answerable: z.boolean(),
  brain_version: z.number().int(),
  source_watermark: z.number().int(),
  has_pending_sources: z.boolean(),
  cited_assertion_ids: z.array(z.string()),
  evidence_event_ids: z.array(z.uuid()),
  uncertainties: z.array(z.string()),
});
export type QueryResult = z.infer<typeof QueryResult>;
