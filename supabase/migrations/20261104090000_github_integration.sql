-- Sprint 3: GitHub integration. A GitHub App installation per workspace, one imported repository
-- per project with its branches, commits and pull requests, links from tasks to that work, and a
-- verified webhook inbox with retries and a dead-letter state (threat model T06–T08).
--
-- Installation tokens are never stored: they are minted per job and expire within the hour. The
-- browser only reads these tables; every write is server-side (secret key) after the app has
-- authorised the user, so there are no insert or update grants for `authenticated`.

create type public.integration_status as enum ('active', 'suspended', 'removed');
create type public.webhook_status as enum ('pending', 'processing', 'processed', 'failed', 'dead');
create type public.task_link_kind as enum ('branch', 'commit', 'pull_request');

-- ---------------------------------------------------------------- tables

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  provider text not null default 'github' check (provider = 'github'),
  installation_id bigint not null unique,
  account_login text not null check (char_length(account_login) between 1 and 100),
  account_type text not null check (account_type in ('User', 'Organization')),
  repository_selection text not null check (repository_selection in ('all', 'selected')),
  -- What the installation was granted, e.g. {"contents": "write"}. Checked against what we request.
  permissions jsonb not null default '{}'::jsonb,
  status public.integration_status not null default 'active',
  installed_by uuid references auth.users (id) on delete set null,
  -- Health indicator: the last successful GitHub call and the last failure (message only, no data).
  last_ok_at timestamptz,
  last_error_at timestamptz,
  last_error text check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

create table public.repositories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete restrict,
  integration_id uuid not null references public.integrations (id) on delete restrict,
  github_repo_id bigint not null,
  full_name text not null check (full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  default_branch text not null,
  private boolean not null,
  html_url text not null check (html_url ~ '^https?://'),
  imported_by uuid references auth.users (id) on delete set null,
  imported_at timestamptz not null default now(),
  last_synced_at timestamptz,
  unique (integration_id, github_repo_id)
);

create table public.repo_branches (
  repository_id uuid not null references public.repositories (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  head_sha text not null check (head_sha ~ '^[0-9a-f]{40}$'),
  protected boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (repository_id, name)
);

create table public.repo_commits (
  repository_id uuid not null references public.repositories (id) on delete cascade,
  sha text not null check (sha ~ '^[0-9a-f]{40}$'),
  branch text,
  message text not null check (char_length(message) <= 2000),
  author_name text check (char_length(author_name) <= 200),
  authored_at timestamptz,
  html_url text,
  primary key (repository_id, sha)
);
create index repo_commits_recent_idx on public.repo_commits (repository_id, authored_at desc);

create table public.repo_pull_requests (
  repository_id uuid not null references public.repositories (id) on delete cascade,
  number integer not null check (number > 0),
  title text not null check (char_length(title) <= 500),
  state text not null check (state in ('open', 'closed', 'merged')),
  head_ref text not null,
  head_sha text not null check (head_sha ~ '^[0-9a-f]{40}$'),
  base_ref text not null,
  html_url text not null,
  -- Summary of the check runs on head_sha: pending, success, failure or none.
  checks text not null default 'none' check (checks in ('none', 'pending', 'success', 'failure')),
  updated_at timestamptz not null default now(),
  primary key (repository_id, number)
);

-- Work on GitHub that mentions a task (NX-12 in a branch name, commit message or PR title).
create table public.task_links (
  task_id uuid not null references public.tasks (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  kind public.task_link_kind not null,
  ref text not null check (char_length(ref) between 1 and 255),
  title text check (char_length(title) <= 500),
  url text,
  created_at timestamptz not null default now(),
  primary key (task_id, kind, ref)
);
create index task_links_repository_idx on public.task_links (repository_id);

-- Every verified delivery, kept so a redelivery or replay is recognised forever (T07). GitHub signs
-- the body but sends no signed timestamp, so the delivery ID's uniqueness is the replay control.
create table public.webhook_events (
  id bigint generated always as identity primary key,
  provider text not null default 'github' check (provider = 'github'),
  delivery_id text not null unique check (char_length(delivery_id) between 1 and 100),
  event text not null check (char_length(event) between 1 and 100),
  action text check (char_length(action) <= 100),
  installation_id bigint,
  payload jsonb not null,
  status public.webhook_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index webhook_events_due_idx on public.webhook_events (next_attempt_at)
  where status in ('pending', 'failed', 'processing');
create index webhook_events_received_idx on public.webhook_events (received_at desc);

-- ---------------------------------------------------------------- triggers

create trigger integrations_touch before update on public.integrations
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- functions

-- Claims due deliveries for processing; SKIP LOCKED lets several workers run side by side. A
-- delivery stuck in "processing" for 10 minutes (a crashed worker) is claimed again.
create function private.claim_webhook_events(batch_size integer, only_delivery text default null)
returns setof public.webhook_events
language sql
security definer
set search_path = ''
as $$
  update public.webhook_events e
  set status = 'processing', attempts = e.attempts + 1, locked_at = now()
  where e.id in (
    select w.id from public.webhook_events w
    where (only_delivery is null or w.delivery_id = only_delivery)
      and (
        (w.status in ('pending', 'failed') and w.next_attempt_at <= now())
        or (w.status = 'processing' and w.locked_at < now() - interval '10 minutes')
      )
    order by w.received_at
    limit greatest(1, least(batch_size, 50))
    for update skip locked
  )
  returning e.*;
$$;

-- Public wrapper so the secret-key client can call it through the API; nobody else may.
create function public.claim_webhook_events(batch_size integer, only_delivery text default null)
returns setof public.webhook_events
language sql
security definer
set search_path = ''
as $$
  select * from private.claim_webhook_events(batch_size, only_delivery);
$$;

revoke execute on function private.claim_webhook_events(integer, text) from public, anon, authenticated;
revoke execute on function public.claim_webhook_events(integer, text) from public, anon, authenticated;
grant execute on function public.claim_webhook_events(integer, text) to service_role;

-- ---------------------------------------------------------------- privileges and RLS

alter table public.integrations enable row level security;
alter table public.repositories enable row level security;
alter table public.repo_branches enable row level security;
alter table public.repo_commits enable row level security;
alter table public.repo_pull_requests enable row level security;
alter table public.task_links enable row level security;
alter table public.webhook_events enable row level security;

revoke all on public.integrations, public.repositories, public.repo_branches, public.repo_commits,
  public.repo_pull_requests, public.task_links, public.webhook_events from anon, authenticated;

grant select on public.integrations, public.repositories, public.repo_branches, public.repo_commits,
  public.repo_pull_requests, public.task_links to authenticated;
-- Deliveries hold raw payloads: the owner reads a few columns for the dead-letter view, never the body.
grant select (id, delivery_id, event, action, status, attempts, last_error, received_at, processed_at)
  on public.webhook_events to authenticated;

create policy "owners read integrations" on public.integrations
  for select to authenticated
  using (private.has_role(workspace_id, array['owner']::public.membership_role[]));

create policy "owners read repositories" on public.repositories
  for select to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]));

create policy "owners read branches" on public.repo_branches
  for select to authenticated
  using (exists (
    select 1 from public.repositories r
    where r.id = repository_id
      and private.has_project_role(r.project_id, array['owner']::public.membership_role[])
  ));

create policy "owners read commits" on public.repo_commits
  for select to authenticated
  using (exists (
    select 1 from public.repositories r
    where r.id = repository_id
      and private.has_project_role(r.project_id, array['owner']::public.membership_role[])
  ));

create policy "owners read pull requests" on public.repo_pull_requests
  for select to authenticated
  using (exists (
    select 1 from public.repositories r
    where r.id = repository_id
      and private.has_project_role(r.project_id, array['owner']::public.membership_role[])
  ));

create policy "owners read task links" on public.task_links
  for select to authenticated
  using (exists (
    select 1 from public.tasks t
    where t.id = task_id
      and private.has_project_role(t.project_id, array['owner']::public.membership_role[])
  ));

create policy "owners read webhook deliveries" on public.webhook_events
  for select to authenticated
  using (private.is_owner());
