-- The project Agent chat: one conversation per project, kept for good, with the files added to it.
-- Like the rest of Nexus Cloud, the browser only reads (owner only); messages and files are written
-- by the server after the owner is authorised.

alter type public.upload_target add value if not exists 'chat';

-- Files added in a chat keep their folder (e.g. "src/components"), so a whole project folder can be
-- shared with the agent. Project-level files have no task.
alter table public.artifacts
  add column folder text check (
    folder is null or (
      char_length(folder) between 1 and 300
      and folder !~ '(^|/)\.\.?(/|$)'
      and folder !~ '^/'
      and strpos(folder, chr(92)) = 0
    )
  );

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  author text not null check (author in ('owner', 'agent')),
  content text not null check (char_length(content) between 1 and 20000),
  -- Files added with this message (project artifacts).
  artifact_ids uuid[] not null default '{}' check (cardinality(artifact_ids) <= 500),
  -- A message the owner turned into a task.
  task_id uuid references public.tasks (id) on delete set null,
  provider public.model_provider,
  model text check (model is null or char_length(model) <= 120),
  cost_usd_micros bigint not null default 0 check (cost_usd_micros >= 0),
  created_at timestamptz not null default now()
);
create index agent_messages_project_idx on public.agent_messages (project_id, created_at);

alter table public.agent_messages enable row level security;
revoke all on public.agent_messages from anon, authenticated;
grant select on public.agent_messages to authenticated;
create policy "owners read the agent chat" on public.agent_messages
  for select to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]));
