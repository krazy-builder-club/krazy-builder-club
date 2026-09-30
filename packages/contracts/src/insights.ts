import { z } from 'zod';

export const InsightKind = z.enum([
  'cohort_supported',
  'hypothesis_only',
  'insufficient_cohort_support',
  'no_action',
]);
export type InsightKind = z.infer<typeof InsightKind>;

/** Proposed help only; the application executes none of these as financial actions. */
export const ProposedAction = z.enum([
  'ASK_A_QUESTION',
  'SHOW_INFORMATION',
  'PREPARE_ACTION',
  'SCHEDULE_REMINDER',
  'HAND_OFF',
  'DO_NOTHING',
]);
export type ProposedAction = z.infer<typeof ProposedAction>;

export const InsightLifecycle = z.enum(['pending', 'dismissed', 'superseded', 'stale']);
export type InsightLifecycle = z.infer<typeof InsightLifecycle>;

/** Demo scenario: 30-day moving-planning need vs observed reference outcome. */
export const CandidateNeed = z.enum(['move_planning_help']);
export const ObservedOutcome = z.enum(['requested_move_planning_help']);

export const FeedbackKind = z.enum(['confirm', 'dismiss', 'correct']);
