-- Sprint 1: identity, workspaces, memberships and the append-only audit log.
-- Rules (ADR 0004, threat model T02/T05): RLS on every table, deny by default; browsers never
-- write audit events; audit rows can never be updated or deleted.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.membership_role as enum ('owner', 'client', 'viewer');

-- ---------------------------------------------------------------- tables

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.membership_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);
-- Release 1 serves exactly one owner (ADR 0012).
create unique index memberships_single_owner_idx on public.memberships ((true)) where role = 'owner';

-- Emails allowed to create an account. Public sign-up is out of scope (requirements brief §4):
-- the owner is added by the server at first sign-in; clients are added by invites (Sprint 9).
create table public.signup_allowlist (
  email text primary key check (email = lower(email)),
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces (id) on delete restrict,
  -- No foreign key: deleting a user must not rewrite history.
  actor_id uuid,
  actor_type text not null check (actor_type in ('user', 'agent', 'system')),
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  target_type text,
  target_id text,
  result text not null check (result in ('success', 'denied', 'error')),
  approval_id uuid,
  correlation_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_workspace_created_idx on public.audit_events (workspace_id, created_at desc);
create index audit_events_correlation_idx on public.audit_events (correlation_id);

-- ---------------------------------------------------------------- helpers

create function private.has_role(target_workspace uuid, allowed public.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = target_workspace
      and m.user_id = (select auth.uid())
      and m.role = any (allowed)
  );
$$;

create function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- Functions are executable by PUBLIC by default; only RLS helpers are granted back.
revoke execute on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.has_role(uuid, public.membership_role[]) to authenticated;
grant execute on function private.is_owner() to authenticated;

-- ---------------------------------------------------------------- triggers

-- Block sign-up for anyone not on the allowlist, including via the public Auth API and OAuth.
create function private.enforce_signup_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.signup_allowlist a where a.email = lower(new.email)) then
    raise exception 'Sign-up is by invitation only' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger enforce_signup_allowlist
  before insert on auth.users
  for each row execute function private.enforce_signup_allowlist();

create function private.create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email));
  return new;
end;
$$;

create trigger create_profile
  after insert on auth.users
  for each row execute function private.create_profile();

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_profiles_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

-- The audit log is append-only for every role, including the table owner.
create function private.reject_audit_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only' using errcode = 'P0001';
end;
$$;

create trigger audit_events_append_only
  before update or delete on public.audit_events
  for each row execute function private.reject_audit_change();

create trigger audit_events_no_truncate
  before truncate on public.audit_events
  for each statement execute function private.reject_audit_change();

-- ---------------------------------------------------------------- privileges and RLS

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.signup_allowlist enable row level security;
alter table public.audit_events enable row level security;

-- Start from nothing, then grant only what each role needs.
revoke all on public.workspaces, public.profiles, public.memberships, public.signup_allowlist,
  public.audit_events from anon, authenticated;
grant select on public.workspaces, public.profiles, public.memberships, public.audit_events to authenticated;
grant update (display_name) on public.profiles to authenticated;
-- Server-side writes use the service role; it may append audit events but never change them.
revoke update, delete, truncate on public.audit_events from service_role;

create policy "members read their workspaces" on public.workspaces
  for select to authenticated
  using (private.has_role(id, array['owner', 'client', 'viewer']::public.membership_role[]));

create policy "users read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "owners read member profiles" on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.user_id = profiles.id
        and private.has_role(m.workspace_id, array['owner']::public.membership_role[])
    )
  );

create policy "users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "users read own memberships" on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "owners read workspace memberships" on public.memberships
  for select to authenticated
  using (private.has_role(workspace_id, array['owner']::public.membership_role[]));

-- signup_allowlist: no policies, so only the service role can read or write it.

create policy "owners read audit events" on public.audit_events
  for select to authenticated
  using (
    case
      when workspace_id is null then private.is_owner()
      else private.has_role(workspace_id, array['owner']::public.membership_role[])
    end
  );

-- ---------------------------------------------------------------- sessions

-- Lets a signed-in user list their own sessions (settings page). auth.sessions is not exposed.
create function public.my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  user_agent text,
  ip text,
  aal text,
  is_current boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.created_at, s.updated_at, s.user_agent, host(s.ip), s.aal::text,
         s.id::text = (select auth.jwt() ->> 'session_id')
  from auth.sessions s
  where s.user_id = (select auth.uid())
  order by s.updated_at desc nulls last;
$$;

revoke execute on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;
