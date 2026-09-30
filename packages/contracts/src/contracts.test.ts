import { describe, expect, it } from 'vitest';
import {
  CreateSubscription,
  EventEnvelope,
  InternalJobRequest,
  JobKind,
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
  it('cannot carry authority fields', () => {
    const patch = {
      base_version: 0,
      source_event_ids: [crypto.randomUUID()],
      operations: [],
      workspace_id: crypto.randomUUID(),
    };
    expect(MemoryPatch.safeParse(patch).success).toBe(false);
  });
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
