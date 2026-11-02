-- Sprint 2: project cockpit. Projects, versioned requirements, milestones, tasks on the workflow
-- board, and task dependencies. The workflow rules mirror packages/core/src/workflow.ts and are
-- enforced here as well, so no client can skip a state or start work on top of unfinished tasks.
-- Access is owner-only for now; clients get a curated view in Sprint 9.

create type public.project_status as enum ('active', 'on_hold', 'completed');
create type public.workflow_state as enum (
  'backlog', 'ready', 'in_progress', 'agent_complete', 'automated_checks', 'needs_human_review',
  'approved', 'preview_ready', 'client_review', 'release_approved', 'deployed', 'verified', 'closed',
  'blocked'
);
create type public.requirement_priority as enum ('must', 'should', 'could', 'wont');
create type public.approval_state as enum ('draft', 'approved', 'rejected');
create type public.milestone_status as enum ('planned', 'in_progress', 'done');

-- ---------------------------------------------------------------- tables

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  client_name text check (char_length(client_name) <= 120),
  stack text check (char_length(stack) <= 200),
  environments text[] not null default '{dev,staging,production}',
  budget_usd numeric(12, 2) not null default 0 check (budget_usd >= 0),
  status public.project_status not null default 'active',
  archived_at timestamptz,
  next_task_number integer not null default 1,
  next_requirement_number integer not null default 1,
  version integer not null default 1,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_workspace_idx on public.projects (workspace_id);

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  ref integer not null default 0, -- assigned by trigger
  title text not null check (char_length(title) between 1 and 200),
  statement text not null check (char_length(statement) between 1 and 5000),
  acceptance_criteria text not null default '' check (char_length(acceptance_criteria) <= 5000),
  priority public.requirement_priority not null default 'should',
  source text check (char_length(source) <= 200),
  approval public.approval_state not null default 'draft',
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  version integer not null default 1,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, ref)
);

-- Every earlier version of a requirement, written by trigger; the current version is the row itself.
create table public.requirement_versions (
  requirement_id uuid not null references public.requirements (id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  primary key (requirement_id, version)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 200),
  criteria text not null default '' check (char_length(criteria) <= 2000),
  target_date date,
  status public.milestone_status not null default 'planned',
  client_visible boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index milestones_project_idx on public.milestones (project_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  ref integer not null default 0, -- assigned by trigger
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 10000),
  state public.workflow_state not null default 'backlog',
  blocked_reason text check (char_length(blocked_reason) <= 500),
  assignee text check (char_length(assignee) <= 120),
  assignee_type text not null default 'human' check (assignee_type in ('human', 'agent')),
  budget_usd numeric(12, 2) not null default 0 check (budget_usd >= 0),
  due_date date,
  acceptance_criteria text not null default '' check (char_length(acceptance_criteria) <= 5000),
  evidence_links text[] not null default '{}' check (cardinality(evidence_links) <= 20),
  requirement_id uuid references public.requirements (id) on delete set null,
  milestone_id uuid references public.milestones (id) on delete set null,
  version integer not null default 1,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, ref)
);
create index tasks_project_state_idx on public.tasks (project_id, state);
create index tasks_milestone_idx on public.tasks (milestone_id);

create table public.task_dependencies (
  task_id uuid not null references public.tasks (id) on delete cascade,
  depends_on_id uuid not null references public.tasks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_id),
  check (task_id <> depends_on_id)
);
create index task_dependencies_depends_on_idx on public.task_dependencies (depends_on_id);

-- Project activity timeline reads audit events by project.
alter table public.audit_events
  add column project_id uuid references public.projects (id) on delete restrict;
create index audit_events_project_created_idx on public.audit_events (project_id, created_at desc);

-- ---------------------------------------------------------------- helpers

create function private.has_project_role(target_project uuid, allowed public.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    join public.memberships m on m.workspace_id = p.workspace_id
    where p.id = target_project
      and m.user_id = (select auth.uid())
      and m.role = any (allowed)
  );
$$;

revoke execute on function private.has_project_role(uuid, public.membership_role[]) from public, anon;
grant execute on function private.has_project_role(uuid, public.membership_role[]) to authenticated;

create function private.workflow_rank(state public.workflow_state)
returns integer
language sql
immutable
set search_path = ''
as $$
  select array_position(
    array['backlog', 'ready', 'in_progress', 'agent_complete', 'automated_checks',
          'needs_human_review', 'approved', 'preview_ready', 'client_review', 'release_approved',
          'deployed', 'verified', 'closed']::public.workflow_state[],
    state
  );
$$;

-- ---------------------------------------------------------------- triggers

-- Optimistic concurrency: every update bumps the version; the app updates "where version = seen".
create function private.bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

-- Projects also change when a task or requirement takes the next reference number; that must not
-- count as an edit, or an open project form would see a false conflict.
create function private.bump_project_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.name, new.client_name, new.stack, new.environments, new.budget_usd, new.status, new.archived_at)
     is distinct from
     (old.name, old.client_name, old.stack, old.environments, old.budget_usd, old.status, old.archived_at) then
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger projects_bump_version before update on public.projects
  for each row execute function private.bump_project_version();
create trigger requirements_bump_version before update on public.requirements
  for each row execute function private.bump_version();
create trigger milestones_bump_version before update on public.milestones
  for each row execute function private.bump_version();
create trigger tasks_bump_version before update on public.tasks
  for each row execute function private.bump_version();

-- Per-project sequential references (REQ-1, NX-1). Security definer: counters are not user-writable.
create function private.assign_task_ref()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.projects set next_task_number = next_task_number + 1
  where id = new.project_id
  returning next_task_number - 1 into new.ref;
  return new;
end;
$$;

create trigger tasks_assign_ref before insert on public.tasks
  for each row execute function private.assign_task_ref();

create function private.assign_requirement_ref()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.projects set next_requirement_number = next_requirement_number + 1
  where id = new.project_id
  returning next_requirement_number - 1 into new.ref;
  return new;
end;
$$;

create trigger requirements_assign_ref before insert on public.requirements
  for each row execute function private.assign_requirement_ref();

-- Requirement history and approval: changing approved content sends it back to draft, and every
-- content change keeps the previous version.
create function private.track_requirement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  content_changed boolean := (new.title, new.statement, new.acceptance_criteria, new.priority, new.source)
    is distinct from (old.title, old.statement, old.acceptance_criteria, old.priority, old.source);
begin
  if content_changed then
    insert into public.requirement_versions (requirement_id, version, snapshot, changed_by)
    values (old.id, old.version, to_jsonb(old), (select auth.uid()));
    if old.approval = 'approved' and new.approval = 'approved' then
      new.approval := 'draft';
    end if;
  end if;

  if new.approval is distinct from old.approval then
    if new.approval = 'approved' then
      new.approved_by := (select auth.uid());
      new.approved_at := now();
    else
      new.approved_by := null;
      new.approved_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger requirements_track before update on public.requirements
  for each row execute function private.track_requirement();

-- Links from a task to a requirement or milestone must stay inside the same project.
create function private.check_task_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.requirement_id is not null and not exists (
    select 1 from public.requirements r where r.id = new.requirement_id and r.project_id = new.project_id
  ) then
    raise exception 'Requirement belongs to another project' using errcode = 'P0001';
  end if;
  if new.milestone_id is not null and not exists (
    select 1 from public.milestones m where m.id = new.milestone_id and m.project_id = new.project_id
  ) then
    raise exception 'Milestone belongs to another project' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger tasks_check_links before insert or update of requirement_id, milestone_id, project_id
  on public.tasks for each row execute function private.check_task_links();

-- The workflow state machine (same rules as checkTransition in @nexus/core).
create function private.check_task_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.state not in ('backlog', 'ready') then
      raise exception 'New tasks start in Backlog or Ready' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.project_id <> old.project_id then
    raise exception 'Tasks cannot move between projects' using errcode = 'P0001';
  end if;
  if new.state = old.state then
    return new;
  end if;

  if new.state = 'blocked' then
    if old.state = 'closed' then
      raise exception 'invalid transition: closed tasks cannot be blocked' using errcode = 'P0001';
    end if;
    if coalesce(btrim(new.blocked_reason), '') = '' then
      raise exception 'A blocked task needs a reason' using errcode = 'P0001';
    end if;
  elsif old.state = 'blocked' then
    if new.state <> 'in_progress' then
      raise exception 'invalid transition: blocked tasks return to in_progress' using errcode = 'P0001';
    end if;
  elsif private.workflow_rank(new.state) <> private.workflow_rank(old.state) + 1 then
    raise exception 'invalid transition: % to %', old.state, new.state using errcode = 'P0001';
  end if;

  if new.state = 'in_progress' and exists (
    select 1 from public.task_dependencies d
    join public.tasks t on t.id = d.depends_on_id
    where d.task_id = new.id and t.state not in ('verified', 'closed')
  ) then
    raise exception 'Dependencies are not done' using errcode = 'P0001';
  end if;

  if new.state <> 'blocked' then
    new.blocked_reason := null;
  end if;
  return new;
end;
$$;

create trigger tasks_check_state before insert or update on public.tasks
  for each row execute function private.check_task_state();

-- Dependencies stay within one project and never form a cycle.
create function private.check_task_dependency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select project_id from public.tasks where id = new.task_id)
     is distinct from (select project_id from public.tasks where id = new.depends_on_id) then
    raise exception 'Dependencies must be in the same project' using errcode = 'P0001';
  end if;
  if exists (
    with recursive reach (id) as (
      select new.depends_on_id
      union
      select d.depends_on_id from public.task_dependencies d join reach r on d.task_id = r.id
    )
    select 1 from reach where id = new.task_id
  ) then
    raise exception 'Dependency would create a cycle' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger task_dependencies_check before insert or update on public.task_dependencies
  for each row execute function private.check_task_dependency();

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(uuid, public.membership_role[]) to authenticated;
grant execute on function private.is_owner() to authenticated;
grant execute on function private.has_project_role(uuid, public.membership_role[]) to authenticated;

-- ---------------------------------------------------------------- privileges and RLS

alter table public.projects enable row level security;
alter table public.requirements enable row level security;
alter table public.requirement_versions enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks enable row level security;
alter table public.task_dependencies enable row level security;

revoke all on public.projects, public.requirements, public.requirement_versions, public.milestones,
  public.tasks, public.task_dependencies from anon, authenticated;

-- Column-level grants: refs, versions, counters and timestamps are never client-writable. A client
-- may choose a new row's UUID (convenient for linking rows); it can never change one.
grant select on public.projects, public.requirements, public.requirement_versions, public.milestones,
  public.tasks, public.task_dependencies to authenticated;
grant insert (id, workspace_id, name, client_name, stack, environments, budget_usd, status)
  on public.projects to authenticated;
grant update (name, client_name, stack, environments, budget_usd, status, archived_at)
  on public.projects to authenticated;
grant insert (id, project_id, title, statement, acceptance_criteria, priority, source)
  on public.requirements to authenticated;
grant update (title, statement, acceptance_criteria, priority, source, approval)
  on public.requirements to authenticated;
grant insert (id, project_id, title, criteria, target_date, status, client_visible)
  on public.milestones to authenticated;
grant update (title, criteria, target_date, status, client_visible) on public.milestones to authenticated;
grant insert (id, project_id, title, description, state, assignee, assignee_type, budget_usd, due_date,
  acceptance_criteria, evidence_links, requirement_id, milestone_id) on public.tasks to authenticated;
grant update (title, description, state, blocked_reason, assignee, assignee_type, budget_usd, due_date,
  acceptance_criteria, evidence_links, requirement_id, milestone_id) on public.tasks to authenticated;
grant insert, delete on public.task_dependencies to authenticated;

create policy "owners read projects" on public.projects
  for select to authenticated
  using (private.has_role(workspace_id, array['owner']::public.membership_role[]));
create policy "owners create projects" on public.projects
  for insert to authenticated
  with check (private.has_role(workspace_id, array['owner']::public.membership_role[]));
create policy "owners update projects" on public.projects
  for update to authenticated
  using (private.has_role(workspace_id, array['owner']::public.membership_role[]))
  with check (private.has_role(workspace_id, array['owner']::public.membership_role[]));

create policy "owners read requirements" on public.requirements
  for select to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]));
create policy "owners create requirements" on public.requirements
  for insert to authenticated
  with check (private.has_project_role(project_id, array['owner']::public.membership_role[]));
create policy "owners update requirements" on public.requirements
  for update to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]))
  with check (private.has_project_role(project_id, array['owner']::public.membership_role[]));

create policy "owners read requirement history" on public.requirement_versions
  for select to authenticated
  using (exists (
    select 1 from public.requirements r
    where r.id = requirement_id
      and private.has_project_role(r.project_id, array['owner']::public.membership_role[])
  ));

create policy "owners read milestones" on public.milestones
  for select to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]));
create policy "owners create milestones" on public.milestones
  for insert to authenticated
  with check (private.has_project_role(project_id, array['owner']::public.membership_role[]));
create policy "owners update milestones" on public.milestones
  for update to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]))
  with check (private.has_project_role(project_id, array['owner']::public.membership_role[]));

create policy "owners read tasks" on public.tasks
  for select to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]));
create policy "owners create tasks" on public.tasks
  for insert to authenticated
  with check (private.has_project_role(project_id, array['owner']::public.membership_role[]));
create policy "owners update tasks" on public.tasks
  for update to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]))
  with check (private.has_project_role(project_id, array['owner']::public.membership_role[]));

create policy "owners read dependencies" on public.task_dependencies
  for select to authenticated
  using (exists (
    select 1 from public.tasks t
    where t.id = task_id and private.has_project_role(t.project_id, array['owner']::public.membership_role[])
  ));
create policy "owners add dependencies" on public.task_dependencies
  for insert to authenticated
  with check (exists (
    select 1 from public.tasks t
    where t.id = task_id and private.has_project_role(t.project_id, array['owner']::public.membership_role[])
  ));
create policy "owners remove dependencies" on public.task_dependencies
  for delete to authenticated
  using (exists (
    select 1 from public.tasks t
    where t.id = task_id and private.has_project_role(t.project_id, array['owner']::public.membership_role[])
  ));
