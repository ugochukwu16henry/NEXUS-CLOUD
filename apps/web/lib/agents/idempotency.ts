import { randomUUID } from "node:crypto";

/** A fresh request id per form render, so a double submit queues one run. */
export function newIdempotencyKey(): string {
  return `plan-${randomUUID()}`;
}
