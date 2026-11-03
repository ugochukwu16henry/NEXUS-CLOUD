/**
 * The queue contract the worker uses. pg-boss is the durable implementation (`./boss`);
 * this memory queue is what the unit tests drive, with the same rules: retry, cancel,
 * dead-letter, and one run per idempotency key.
 */

export type QueueJob<T> = {
  id: string;
  name: string;
  data: T;
  idempotencyKey: string;
  attempt: number;
  status: "ready" | "active" | "done" | "dead" | "cancelled";
};

export type EnqueueResult = { id: string; duplicate: boolean };

export class MemoryQueue<T> {
  readonly jobs = new Map<string, QueueJob<T>>();
  private readonly byKey = new Map<string, string>();
  private readonly controllers = new Map<string, AbortController>();
  private sequence = 0;

  constructor(private readonly options: { retryLimit?: number } = {}) {}

  enqueue(name: string, data: T, idempotencyKey: string): EnqueueResult {
    const existing = this.byKey.get(`${name}:${idempotencyKey}`);
    if (existing) return { id: existing, duplicate: true };
    const id = `job-${++this.sequence}`;
    this.jobs.set(id, {
      id,
      name,
      data,
      idempotencyKey,
      attempt: 0,
      status: "ready",
    });
    this.byKey.set(`${name}:${idempotencyKey}`, id);
    return { id, duplicate: false };
  }

  cancel(id: string): void {
    const job = this.jobs.get(id);
    if (!job || job.status === "done" || job.status === "dead") return;
    job.status = "cancelled";
    this.controllers.get(id)?.abort();
  }

  /**
   * Run the next ready job once. A thrown error is a worker crash: the job is retried
   * until `retryLimit`, then dead-lettered. Cancellation aborts the signal the handler holds.
   */
  async dispatch(
    name: string,
    handler: (job: QueueJob<T>, signal: AbortSignal) => Promise<void>,
  ): Promise<QueueJob<T> | null> {
    const job = [...this.jobs.values()].find(
      (item) => item.name === name && item.status === "ready",
    );
    if (!job) return null;
    job.status = "active";
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    try {
      await handler(job, controller.signal);
      if (controller.signal.aborted || isCancelled(job)) {
        job.status = "cancelled";
      } else {
        job.status = "done";
      }
    } catch {
      if (controller.signal.aborted || isCancelled(job)) {
        job.status = "cancelled";
      } else {
        job.attempt += 1;
        job.status = job.attempt > (this.options.retryLimit ?? 2) ? "dead" : "ready";
      }
    } finally {
      this.controllers.delete(job.id);
    }
    return job;
  }
}

function isCancelled<T>(job: QueueJob<T>): boolean {
  return job.status === "cancelled";
}
