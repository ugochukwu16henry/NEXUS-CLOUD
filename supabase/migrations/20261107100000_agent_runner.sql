-- Sprint 6, the runner: a coding run paused for a command approval keeps its conversation here,
-- so the worker resumes where it stopped. Only the worker writes it, and the browser can't read
-- it (it holds file contents and command output): owners keep reading every other column.

alter table public.agent_runs
  add column state jsonb check (state is null or jsonb_typeof(state) = 'object');

revoke select on public.agent_runs from authenticated;
grant select (
  id, project_id, task_id, kind, status, purpose, stop_condition, budget_usd_micros,
  spent_usd_micros, max_iterations, iteration, idempotency_key, error, created_by, created_at,
  started_at, finished_at
) on public.agent_runs to authenticated;

-- One pending question per run: a resumed run never asks twice for the same step.
create unique index command_approvals_pending_idx
  on public.command_approvals (run_id) where decision = 'pending';
