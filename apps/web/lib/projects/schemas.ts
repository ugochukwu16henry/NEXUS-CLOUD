import { BLOCKED_STATE, WORKFLOW_STATES } from "@nexus/core";
import { z } from "zod";

/**
 * Validation for project cockpit forms. The database enforces the same limits; these give the
 * user a readable message before anything is sent.
 */

const trimmed = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);

const required = (max: number, label: string) =>
  trimmed(max, label).min(1, `${label} is required.`);

/** Empty form fields become null. */
const optionalText = (max: number, label: string) =>
  trimmed(max, label).transform((value) => value || null);

const money = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const amount = value === "" ? 0 : Number(value);
    if (!Number.isFinite(amount)) {
      ctx.addIssue({ code: "custom", message: "Enter an amount in USD." });
      return z.NEVER;
    }
    return amount;
  })
  .pipe(
    z.number().min(0, "Amounts can't be negative.").max(1_000_000_000, "That amount is too large."),
  )
  .transform((value) => Math.round(value * 100) / 100);

const optionalDate = z
  .string()
  .trim()
  .transform((value) => value || null)
  .pipe(z.iso.date({ error: "Enter a valid date." }).nullable());

const optionalId = z
  .string()
  .trim()
  .transform((value) => value || null)
  .pipe(z.uuid().nullable());

/** Comma- or newline-separated list. */
const list = (max: number) =>
  z
    .string()
    .transform((value) =>
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string()).max(max));

export const id = z.uuid({ error: "Missing or invalid id." });
export const version = z.coerce.number().int().positive();

export const projectFields = z.object({
  name: required(120, "Name"),
  stack: optionalText(200, "Stack"),
  environments: list(10).pipe(
    z.array(
      z
        .string()
        .regex(
          /^[a-z0-9-]{1,30}$/,
          "Environments are short lower-case names like dev, staging, production.",
        ),
    ),
  ),
  budgetUsd: money,
});

export const projectUpdate = projectFields.extend({
  projectId: id,
  version,
  status: z.enum(["active", "on_hold", "completed"]),
});

export const requirementFields = z.object({
  title: required(200, "Title"),
  statement: required(5000, "Statement"),
  acceptanceCriteria: trimmed(5000, "Acceptance criteria"),
  priority: z.enum(["must", "should", "could", "wont"]),
  source: optionalText(200, "Source"),
});

export const milestoneFields = z.object({
  title: required(200, "Title"),
  criteria: trimmed(2000, "Criteria"),
  targetDate: optionalDate,
  status: z.enum(["planned", "in_progress", "done"]),
});

export const taskFields = z.object({
  title: required(200, "Title"),
  description: trimmed(10000, "Description"),
  assignee: optionalText(120, "Assignee"),
  assigneeType: z.enum(["human", "agent"]),
  budgetUsd: money,
  dueDate: optionalDate,
  acceptanceCriteria: trimmed(5000, "Acceptance criteria"),
  evidenceLinks: list(20).pipe(
    z.array(z.url({ protocol: /^https$/, error: "Evidence links must be https:// URLs." })),
  ),
  requirementId: optionalId,
  milestoneId: optionalId,
});

export const taskMove = z.object({
  projectId: id,
  taskId: id,
  version,
  to: z.enum([...WORKFLOW_STATES, BLOCKED_STATE]),
  // The reason field is only in the form when Blocked is chosen, so it may be absent.
  blockedReason: z.string().default("").pipe(optionalText(500, "Reason")),
});

/** Turns FormData into a plain object; fields that repeat become arrays. */
export function formObject(formData: FormData): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const existing = result[key];
    if (existing === undefined) result[key] = value;
    else result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return result;
}

/** First validation message, phrased for the user. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
