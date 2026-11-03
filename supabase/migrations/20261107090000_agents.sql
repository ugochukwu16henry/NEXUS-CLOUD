-- Sprint 6: agent runs, command approvals, terminal tickets and sandbox settings.
-- The browser only reads. Runs, approvals and tickets are written with the secret key
-- after the server has authorised the owner.

create type public.agent_kind as enum ('planner', 'coder');
create type public.agent_run_status as enum (
  'queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled'
);
create type public.approval_mode as enum ('ask', 'safe_list', 'custom');
create type public.command_decision as enum ('pending', 'approved', 'denied');
create type public.artifact_visibility as enum ('internal', 'client');
create type public.artifact_approval as enum ('pending', 'approved', 'rejected');
create type public.sandbox_session_kind as enum ('terminal', 'agent');

alter table public.workspace_settings
  add column node_major integer not null default 24 check (node_major between 20 and 24),
  add column install_command text not null default 'pnpm install'
    check (char_length(install_command) between 1 and 200),
  add column test_command text not null default 'pnpm test'
    check (char_length(test_command) between 1 and 200),
  add column build_command text not null default 'pnpm build'
    check (char_length(build_command) between 1 and 200),
  add column start_command text not null default 'pnpm dev'
    check (char_length(start_command) between 1 and 200),
  add column plain_env jsonb not null default '{}'::jsonb
    check (jsonb_typeof(plain_env) = 'object'),
  add column terminal_idle_seconds integer not null default 900
    check (terminal_idle_seconds between 60 and 3600),
  add column terminal_max_sessions integer not null default 3
    check (terminal_max_sessions between 1 and 8),
  add column approval_mode public.approval_mode not null default 'safe_list',
  add column custom_commands text[] not null default '{}'
    check (cardinality(custom_commands) <= 40),
  add column agent_max_iterations integer not null default 8
    check (agent_max_iterations between 1 and 30);

alter table public.artifacts
  add column visibility public.artifact_visibility not null default 'internal',
  add column approval public.artifact_approval not null default 'pending',
  add column retain_until timestamptz;

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  task_id uuid not null references public.tasks (id) on delete cascade,
  kind public.agent_kind not null,
  status public.agent_run_status not null default 'queued',
  purpose text not null check (char_length(purpose) between 1 and 4000),
  stop_condition text not null check (char_length(stop_condition) between 1 and 500),
  budget_usd_micros bigint not null check (budget_usd_micros > 0),
  spent_usd_micros bigint not null default 0 check (spent_usd_micros >= 0),
  max_iterations integer not null check (max_iterations between 1 and 30),
  iteration integer not null default 0 check (iteration >= 0),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  error text check (error is null or char_length(error) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (project_id, idempotency_key)
);
create index agent_runs_task_idx on public.agent_runs (task_id, created_at desc);

create table public.agent_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete restrict,
  kind text not null check (kind in ('plan', 'message', 'command', 'finding', 'diff', 'usage')),
  summary text not null check (char_length(summary) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index agent_events_run_idx on public.agent_events (run_id, created_at);

create table public.command_approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete restrict,
  command text not null check (char_length(command) between 1 and 500),
  decision public.command_decision not null default 'pending',
  reason text check (reason is null or char_length(reason) <= 200),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.sandbox_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  kind public.sandbox_session_kind not null,
  ticket_hash text not null unique check (ticket_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  idle_seconds integer not null check (idle_seconds between 60 and 3600),
  connected_at timestamptz,
  closed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.artifacts
  add column agent_run_id uuid references public.agent_runs (id) on delete set null;

alter table public.usage_ledger
  add constraint usage_ledger_run_id_fkey
  foreign key (run_id) references public.agent_runs (id) on delete set null;

-- ---------------------------------------------------------------- privileges and RLS

alter table public.agent_runs enable row level security;
alter table public.agent_events enable row level security;
alter table public.command_approvals enable row level security;
alter table public.sandbox_sessions enable row level security;

revoke all on public.agent_runs, public.agent_events, public.command_approvals,
  public.sandbox_sessions from anon, authenticated;
grant select on public.agent_runs, public.agent_events, public.command_approvals
  to authenticated;
-- Tickets are server-only. The browser receives the raw token once, never the row.

create policy "owners read agent runs" on public.agent_runs
  for select to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]));
create policy "owners read agent events" on public.agent_events
  for select to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]));
create policy "owners read command approvals" on public.command_approvals
  for select to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]));
