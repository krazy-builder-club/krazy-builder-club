import {
  type Assertion,
  type AssertionKind,
  CATEGORY_PREFIX,
  type EvidenceRef,
  type EvidenceSource,
  KIND_PLACEMENT,
  MEMORY_SCHEMA_VERSION,
  type MemoryOperation,
  type MemoryPatch,
  PersonalityTag,
  type ProfileSignature,
  SituationTag,
  type StructuredMemory,
} from '@bob/contracts';

export const emptyMemory = (): StructuredMemory => ({
  schema_version: MEMORY_SCHEMA_VERSION,
  summary: '',
  next_id: 1,
  assertions: [],
  evidence: [],
});

/** Default review horizons (days): categories age differently (ADR 0008). */
const REVIEW_DAYS: Partial<Record<AssertionKind, number>> = {
  circumstance: 90,
  commitment: 90,
  constraint: 90,
  transition: 30,
  goal: 30,
};
const INFERRED_PERSONALITY_REVIEW_DAYS = 180;

export type ApplyResult =
  | {
      ok: true;
      memory: StructuredMemory;
      counts: { added: number; updated: number; retired: number };
    }
  | { ok: false; errors: string[] };

const addDays = (instant: string, days: number) =>
  new Date(Date.parse(instant) + days * 86_400_000).toISOString().slice(0, 10);

/** Accepts `YYYY-MM-DD` or an RFC 3339 instant; returns the calendar date, or undefined. */
function toDate(value: string | null | undefined): string | undefined | null {
  if (value === null || value === undefined || value === '') return undefined;
  const date = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
  if (!date || Number.isNaN(Date.parse(date))) return null;
  return date;
}

function tagAllowed(kind: AssertionKind, tag: string) {
  const { category } = KIND_PLACEMENT[kind];
  if (category === 'personality') return PersonalityTag.safeParse(tag).success;
  if (category === 'situation') return SituationTag.safeParse(tag).success;
  return false;
}

/**
 * Validates a model patch against the current memory and the new source batch, then applies it.
 * Pure and deterministic: the same inputs and `now` always produce the same memory. Returns every
 * problem found (for one repair round) instead of stopping at the first.
 *
 * Rules: evidence must cite this customer's known sources, and each operation must cite at least
 * one source from the new batch; updates/retirements target active assertions; the kind fixes the
 * category, document and ID prefix and cannot change; tags come from the category vocabulary.
 */
export function applyPatch(
  current: StructuredMemory,
  patch: MemoryPatch,
  batch: readonly EvidenceSource[],
  now: string,
): ApplyResult {
  const errors: string[] = [];
  const ledger = new Map<number, EvidenceSource>();
  for (const e of current.evidence) ledger.set(e.sequence, e);
  const batchSequences = new Set(batch.map((e) => e.sequence));
  for (const e of batch) ledger.set(e.sequence, e);

  const assertions = new Map(current.assertions.map((a) => [a.id, structuredClone(a)]));
  const touched = new Set<string>();
  const keys = new Map<string, string>();
  let nextId = current.next_id;
  const counts = { added: 0, updated: 0, retired: 0 };
  const pendingRelations: { id: string; related: string[]; at: string }[] = [];

  const evidenceFor = (op: MemoryOperation, at: string): EvidenceRef[] | undefined => {
    const refs: EvidenceRef[] = [];
    for (const sequence of new Set(op.evidence)) {
      const source = ledger.get(sequence);
      if (!source) {
        errors.push(`${at}: evidence #${sequence} is not a source of this customer`);
        return undefined;
      }
      refs.push({ event_id: source.event_id, sequence });
    }
    if (!refs.some((r) => batchSequences.has(r.sequence))) {
      errors.push(`${at}: must cite at least one new source (${[...batchSequences].join(', ')})`);
      return undefined;
    }
    return refs.sort((a, b) => a.sequence - b.sequence);
  };

  const dates = (op: MemoryOperation, at: string) => {
    const out: Partial<
      Record<'valid_from' | 'valid_until' | 'review_after' | 'target_date', string>
    > = {};
    for (const field of ['valid_from', 'valid_until', 'review_after', 'target_date'] as const) {
      const d = toDate(op[field]);
      if (d === null) errors.push(`${at}: ${field} must be a YYYY-MM-DD date`);
      else if (d) out[field] = d;
    }
    return out;
  };

  const checkKindFields = (kind: AssertionKind, op: MemoryOperation, at: string) => {
    if (op.tag && !tagAllowed(kind, op.tag)) {
      errors.push(
        `${at}: tag "${op.tag}" is not in the ${KIND_PLACEMENT[kind].category} vocabulary`,
      );
    }
    if (kind !== 'goal' && (op.goal_state || op.target_date)) {
      errors.push(`${at}: goal_state/target_date only apply to kind "goal"`);
    }
  };

  patch.operations.forEach((op, index) => {
    const at = `operations[${index}] (${op.op})`;
    if (op.op === 'add') {
      if (!op.kind || !op.area || !op.statement || !op.status) {
        errors.push(`${at}: add requires kind, area, statement and status`);
        return;
      }
      if (op.status === 'corrected') {
        errors.push(`${at}: a new assertion cannot be "corrected"; use update`);
        return;
      }
      checkKindFields(op.kind, op, at);
      const evidence = evidenceFor(op, at);
      const d = dates(op, at);
      if (!evidence) return;
      const id = `${CATEGORY_PREFIX[KIND_PLACEMENT[op.kind].category]}_${String(nextId++).padStart(3, '0')}`;
      if (op.key) {
        if (keys.has(op.key)) errors.push(`${at}: duplicate key "${op.key}"`);
        keys.set(op.key, id);
      }
      assertions.set(id, {
        id,
        kind: op.kind,
        area: op.area,
        statement: op.statement.trim(),
        status: op.status,
        evidence,
        ...(op.tag ? { tag: op.tag } : {}),
        ...(op.context ? { context: op.context.trim() } : {}),
        ...d,
        ...(op.kind === 'goal' ? { goal_state: op.goal_state ?? 'open' } : {}),
        recorded_at: now,
        updated_at: now,
      });
      touched.add(id);
      if (op.related?.length) pendingRelations.push({ id, related: op.related, at });
      counts.added++;
      return;
    }

    const existing = op.id ? assertions.get(op.id) : undefined;
    if (!op.id || !existing) {
      errors.push(`${at}: unknown assertion id "${op.id ?? ''}"`);
      return;
    }
    if (existing.status === 'retired') {
      errors.push(`${at}: ${op.id} is already retired`);
      return;
    }
    if (touched.has(op.id)) {
      errors.push(`${at}: ${op.id} is changed more than once in this patch`);
      return;
    }
    if (op.kind && op.kind !== existing.kind) {
      errors.push(`${at}: kind cannot change (retire ${op.id} and add a new assertion)`);
      return;
    }
    const evidence = evidenceFor(op, at);
    if (!evidence) return;
    touched.add(op.id);
    const merged = new Map(existing.evidence.map((r) => [r.sequence, r]));
    for (const r of evidence) merged.set(r.sequence, r);
    existing.evidence = [...merged.values()].sort((a, b) => a.sequence - b.sequence);
    existing.updated_at = now;

    if (op.op === 'retire') {
      existing.status = 'retired';
      existing.retired_at = now;
      existing.retired_reason = op.reason.trim();
      counts.retired++;
      return;
    }

    checkKindFields(existing.kind, op, at);
    const d = dates(op, at);
    if (op.statement) existing.statement = op.statement.trim();
    if (op.status) existing.status = op.status;
    if (op.area) existing.area = op.area;
    if (op.tag) existing.tag = op.tag;
    if (op.context) existing.context = op.context.trim();
    Object.assign(existing, d);
    if (op.goal_state && existing.kind === 'goal') existing.goal_state = op.goal_state;
    if (op.related?.length) pendingRelations.push({ id: op.id, related: op.related, at });
    counts.updated++;
  });

  for (const { id, related, at } of pendingRelations) {
    const resolved: string[] = [];
    for (const ref of related) {
      const target = keys.get(ref) ?? (assertions.has(ref) ? ref : undefined);
      if (!target || target === id) errors.push(`${at}: related "${ref}" is not a known assertion`);
      else resolved.push(target);
    }
    const assertion = assertions.get(id);
    if (assertion) {
      assertion.related_ids = [...new Set([...(assertion.related_ids ?? []), ...resolved])].sort();
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // Deterministic review defaults, only where the model gave none.
  for (const id of touched) {
    const a = assertions.get(id);
    if (!a || a.status === 'retired' || a.review_after) continue;
    const days =
      KIND_PLACEMENT[a.kind].category === 'personality' && a.status === 'inferred'
        ? INFERRED_PERSONALITY_REVIEW_DAYS
        : REVIEW_DAYS[a.kind];
    if (days !== undefined) a.review_after = a.target_date ?? a.valid_until ?? addDays(now, days);
  }

  const evidence = new Map(current.evidence.map((e) => [e.sequence, e]));
  for (const e of batch) evidence.set(e.sequence, e);
  return {
    ok: true,
    counts,
    memory: {
      schema_version: MEMORY_SCHEMA_VERSION,
      summary: (patch.summary ?? current.summary).trim(),
      next_id: nextId,
      assertions: [...assertions.values()].sort(compareIds),
      evidence: [...evidence.values()].sort((a, b) => a.sequence - b.sequence),
    },
  };
}

/** Sorts `s_002` before `s_010`, grouped by prefix. */
export function compareIds(a: { id: string }, b: { id: string }) {
  const [pa, na] = a.id.split('_');
  const [pb, nb] = b.id.split('_');
  return pa === pb ? Number(na) - Number(nb) : (pa ?? '').localeCompare(pb ?? '');
}

/** Matching tags from active personality/situation assertions (never from inferences alone). */
export function signatureOf(memory: StructuredMemory): ProfileSignature {
  const personality = new Set<ProfileSignature['personality'][number]>();
  const situation = new Set<ProfileSignature['situation'][number]>();
  for (const a of memory.assertions) {
    if (a.status === 'retired' || !a.tag) continue;
    const { category } = KIND_PLACEMENT[a.kind];
    if (category === 'personality') {
      const tag = PersonalityTag.safeParse(a.tag);
      if (tag.success) personality.add(tag.data);
    } else if (category === 'situation') {
      const tag = SituationTag.safeParse(a.tag);
      if (tag.success) situation.add(tag.data);
    }
  }
  return { personality: [...personality].sort(), situation: [...situation].sort() };
}

export const isActive = (a: Assertion) => a.status !== 'retired';
