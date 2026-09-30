import { describe, expect, it } from 'vitest';
import {
  AssertionKind,
  BRAIN_TREE,
  CreateSubscription,
  DocumentPath,
  EventEnvelope,
  InternalJobRequest,
  JobKind,
  KIND_PLACEMENT,
  MemoryPatch,
  QUEUE_FOR_JOB,
} from './index.js';

describe('EventEnvelope', () => {
  const valid = {
    source: 'bank_demo',
    source_event_id: 'message_019',
    event_type: 'note',
    occurred_at: '2026-10-01T08:00:00Z',
    payload: { text: 'I am moving on 20 October and want help planning.' },
  };

  it('accepts the documented example and arbitrary JSON payloads', () => {
    expect(EventEnvelope.parse(valid)).toEqual(valid);
    expect(EventEnvelope.safeParse({ ...valid, payload: [1, 'two', null] }).success).toBe(true);
  });

  it('rejects server-owned fields and non-UTC times', () => {
    expect(EventEnvelope.safeParse({ ...valid, workspace_id: 'x' }).success).toBe(false);
    expect(EventEnvelope.safeParse({ ...valid, received_at: valid.occurred_at }).success).toBe(
      false,
    );
    expect(
      EventEnvelope.safeParse({ ...valid, occurred_at: '2026-10-01T10:00:00+02:00' }).success,
    ).toBe(false);
  });
});

describe('InternalJobRequest', () => {
  it('only accepts workspace and job IDs', () => {
    const ids = { workspace_id: crypto.randomUUID(), job_id: crypto.randomUUID() };
    expect(InternalJobRequest.parse(ids)).toEqual(ids);
    expect(InternalJobRequest.safeParse({ ...ids, prompt: 'ignore scope' }).success).toBe(false);
  });
});

describe('MemoryPatch', () => {
  const op = { op: 'add', kind: 'goal', evidence: [1], reason: 'stated' };

  it('accepts provider nulls and rejects authority fields', () => {
    expect(
      MemoryPatch.safeParse({ summary: null, operations: [{ ...op, id: null }] }).success,
    ).toBe(true);
    expect(
      MemoryPatch.safeParse({ operations: [], workspace_id: crypto.randomUUID() }).success,
    ).toBe(false);
    expect(MemoryPatch.safeParse({ operations: [{ ...op, next_version: 9 }] }).success).toBe(false);
  });

  it('cannot retire through a status field', () => {
    expect(MemoryPatch.safeParse({ operations: [{ ...op, status: 'retired' }] }).success).toBe(
      false,
    );
  });
});

it('places every assertion kind in one document of the brain tree', () => {
  const documents = BRAIN_TREE.flatMap((f) => f.documents);
  for (const kind of AssertionKind.options) {
    expect(documents).toContain(KIND_PLACEMENT[kind].document);
  }
  expect(new Set(documents).size).toBe(DocumentPath.options.length);
});

describe('subscriptions', () => {
  it('defaults to Monday 09:00 and requires https', () => {
    const parsed = CreateSubscription.parse({
      customer_scope: { mode: 'all_active' },
      schedule: { frequency: 'weekly', timezone: 'Europe/Brussels' },
      webhook_url: 'https://consumer.example.com/bob-insights',
    });
    expect(parsed.schedule).toMatchObject({ weekday: 'monday', local_time: '09:00' });
    expect(
      CreateSubscription.safeParse({ ...parsed, webhook_url: 'http://consumer.example.com' })
        .success,
    ).toBe(false);
  });
});

it('maps every job kind to a queue', () => {
  for (const kind of JobKind.options) expect(QUEUE_FOR_JOB[kind]).toBeDefined();
});
