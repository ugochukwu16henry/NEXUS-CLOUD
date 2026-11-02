import type { WorkflowState } from "@nexus/core";

// Static sample data for the Sprint 0 prototype. Replaced by Supabase queries from Sprint 2.

export const PROJECT = {
  name: "nexus-pilot-app",
  branch: "task/NX-12-password-reset",
  budgetUsedUsd: 3.42,
  budgetLimitUsd: 20,
};

export const FILES = [
  { path: "app/(auth)/reset/page.tsx", status: "A" },
  { path: "app/api/auth/reset/route.ts", status: "A" },
  { path: "lib/email.ts", status: "M" },
  { path: "tests/reset.test.ts", status: "A" },
  { path: "README.md", status: "" },
  { path: "package.json", status: "" },
] as const;

export const DIFF_LINES: { kind: "add" | "del" | "ctx"; text: string }[] = [
  { kind: "ctx", text: 'import { sendEmail } from "@/lib/email";' },
  { kind: "del", text: "export async function POST() {" },
  { kind: "add", text: "export async function POST(request: Request) {" },
  { kind: "add", text: "  const { email } = resetSchema.parse(await request.json());" },
  {
    kind: "add",
    text: "  await issueResetToken(email); // same response whether or not the user exists",
  },
  { kind: "ctx", text: "  return Response.json({ ok: true });" },
  { kind: "ctx", text: "}" },
];

export const BOARD: { id: string; title: string; state: WorkflowState; owner: string }[] = [
  { id: "NX-10", title: "Email service adapter", state: "verified", owner: "Coding agent" },
  { id: "NX-11", title: "Reset token table + RLS", state: "approved", owner: "Henry" },
  { id: "NX-12", title: "Password reset flow", state: "needs_human_review", owner: "Coding agent" },
  { id: "NX-13", title: "Reset E2E journey", state: "automated_checks", owner: "Test agent" },
  { id: "NX-14", title: "Rate-limit reset endpoint", state: "blocked", owner: "Security agent" },
  { id: "NX-15", title: "Client update: auth milestone", state: "ready", owner: "Client reporter" },
];

export const AGENT_RUN = {
  agent: "Coding agent",
  model: "(chosen by benchmark — Sprint 5)",
  purpose: "Implement NX-12 password reset endpoint and page",
  budgetUsd: 0.25,
  spentUsd: 0.11,
  stopCondition: "Tests pass or 6 iterations",
  steps: [
    { label: "Read context: 4 files", done: true },
    { label: "Write diff: 3 files", done: true },
    { label: "Run tests in sandbox", done: true },
    { label: "Await human review", done: false },
  ],
};

export const CONSOLE_LINES = [
  "[sandbox] pnpm install --frozen-lockfile  ✓ 8.1s",
  "[sandbox] pnpm typecheck                 ✓",
  "[sandbox] pnpm test                      ✓ 42 passed",
  "[scan] gitleaks                          ✓ no secrets",
  "[scan] osv-scanner                       ✓ 0 vulnerabilities",
  "[scan] semgrep                           ⚠ 1 medium: missing rate limit (NX-14)",
  "[gate] needs human review — approve to create preview",
];
