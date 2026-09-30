import type { JobKind, QueueKind } from '@bob/contracts';

export type TaskRequest = {
  queue: QueueKind;
  kind: JobKind;
  workspaceId: string;
  jobId: string;
  /** Deterministic per job/generation, so an ambiguous create can be retried safely. */
  name: string;
};

/**
 * Moves `{workspace_id, job_id}` references to the worker. The Cloud Tasks implementation
 * (HTTP target on the IAM-only worker, OIDC token) is added with GCP provisioning; the local
 * transport runs the same handler path in-process without Google credentials.
 */
export interface TaskTransport {
  enqueue(task: TaskRequest): Promise<void>;
}

export const taskName = (jobId: string, generation: number) => `job-${jobId}-g${generation}`;

/** In-process transport for local development and tests. Deduplicates by task name. */
export class LocalTransport implements TaskTransport {
  private readonly seen = new Set<string>();
  private readonly pending: TaskRequest[] = [];

  constructor(private readonly run: (task: TaskRequest) => Promise<unknown>) {}

  async enqueue(task: TaskRequest): Promise<void> {
    if (this.seen.has(task.name)) return;
    this.seen.add(task.name);
    this.pending.push(task);
  }

  /** Runs everything queued so far (and anything those runs enqueue). */
  async drain(): Promise<number> {
    let ran = 0;
    for (let task = this.pending.shift(); task; task = this.pending.shift()) {
      await this.run(task);
      ran++;
    }
    return ran;
  }
}
