-- Sprint 4: repository workspace (ADR 0016, 0017). A task's uncommitted work is a change set:
-- one row per changed file, with contents in private storage. Uploads are prepared as a batch
-- (signed upload URLs), then checked on the server before they join a change set or become an
-- attachment. Commits go to GitHub through the Git Data API, never from the browser.
--
-- As with Sprint 3, the browser only reads: every write happens server-side after the app has
-- authorised the owner, so `authenticated` gets select grants and nothing else.

create type public.changeset_status as enum ('open', 'committed', 'discarded');
create type public.file_change as enum ('add', 'modify', 'delete');
create type public.upload_target as enum ('worktree', 'attachment');
create type public.artifact_kind as enum ('image', 'pdf', 'text', 'other');

-- ---------------------------------------------------------------- tables

-- Per-project limits and rules for uploads (Project → Settings → Workspace).
create table public.workspace_settings (
  project_id uuid primary key references public.projects (id) on delete cascade,
  max_file_mb integer not null default 25 check (max_file_mb between 1 and 100),
  max_upload_mb integer not null default 200 check (max_upload_mb between 1 and 1000),
  max_files integer not null default 1000 check (max_files between 1 and 5000),
  attachment_max_mb integer not null default 20 check (attachment_max_mb between 1 and 100),
  attachment_kinds public.artifact_kind[] not null default '{image,pdf,text}',
  skip_folders text[] not null default '{node_modules,.next,dist,build,coverage,.turbo,.cache}'
    check (cardinality(skip_folders) <= 50),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table public.changesets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  branch text not null check (branch ~ '^task/NX-[0-9]+(-[a-z0-9-]+)?$'),
  -- The branch head the changes are based on; a commit fails if the branch moved since.
  base_sha text not null check (base_sha ~ '^[0-9a-f]{40}$'),
  status public.changeset_status not null default 'open',
  locked_by uuid references auth.users (id) on delete set null,
  locked_until timestamptz,
  committed_sha text check (committed_sha ~ '^[0-9a-f]{40}$'),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One open change set per task.
create unique index changesets_open_task_idx on public.changesets (task_id) where status = 'open';

create table public.changeset_files (
  changeset_id uuid not null references public.changesets (id) on delete cascade,
  path text not null check (char_length(path) between 1 and 300 and path !~ '(^|/)\.\.?(/|$)' and path !~ '^/'),
  change public.file_change not null,
  storage_key text check (storage_key ~ '^[0-9a-f-]{36}/'),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  is_binary boolean not null default false,
  -- Flagged by the upload checks (e.g. looks like a secret): kept out of commits until confirmed.
  held_reason text check (char_length(held_reason) <= 200),
  updated_at timestamptz not null default now(),
  primary key (changeset_id, path),
  check (change = 'delete' or storage_key is not null)
);

-- Files attached to a project, task or requirement (screenshots, designs, PDFs). Not part of the code.
create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  task_id uuid references public.tasks (id) on delete set null,
  kind public.artifact_kind not null,
  filename text not null check (char_length(filename) between 1 and 255 and filename !~ '[/\\]'),
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text not null unique,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index artifacts_task_idx on public.artifacts (task_id);
create index artifacts_project_idx on public.artifacts (project_id, created_at desc);

-- An upload in progress: the files the server agreed to accept and where each may be stored.
-- Finishing an upload only processes these objects, so the browser can't slip in others.
create table public.upload_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  target public.upload_target not null,
  files jsonb not null check (jsonb_typeof(files) = 'array'),
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '1 hour',
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- triggers

-- bump_version also sets updated_at.
create trigger workspace_settings_version before update on public.workspace_settings
  for each row execute function private.bump_version();
create trigger changesets_version before update on public.changesets
  for each row execute function private.bump_version();

-- ---------------------------------------------------------------- storage

-- Private buckets: no storage policies for browser roles, so objects are reachable only through
-- short-lived signed URLs that the server issues after authorising the owner.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('workspace', 'workspace', false, 104857600),
  ('attachments', 'attachments', false, 104857600)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- privileges and RLS

alter table public.workspace_settings enable row level security;
alter table public.changesets enable row level security;
alter table public.changeset_files enable row level security;
alter table public.artifacts enable row level security;
alter table public.upload_batches enable row level security;

revoke all on public.workspace_settings, public.changesets, public.changeset_files,
  public.artifacts, public.upload_batches from anon, authenticated;
grant select on public.workspace_settings, public.changesets, public.changeset_files,
  public.artifacts to authenticated;
-- Upload batches are bookkeeping for the server only.

create policy "owners read workspace settings" on public.workspace_settings
  for select to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]));
create policy "owners read change sets" on public.changesets
  for select to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]));
create policy "owners read changed files" on public.changeset_files
  for select to authenticated
  using (exists (
    select 1 from public.changesets c
    where c.id = changeset_id
      and private.has_project_role(c.project_id, array['owner']::public.membership_role[])
  ));
create policy "owners read attachments" on public.artifacts
  for select to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]));
