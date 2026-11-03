-- Sprint 5: usage ledger, spend caps and model routing.
-- The browser only reads. Every call and every cap change is written with the secret key after
-- the server has authorised the owner, so a model key never reaches the browser (ADR 0008).

create type public.model_provider as enum (
  'anthropic', 'openai', 'gemini', 'xai', 'deepseek', 'groq', 'openrouter'
);
create type public.model_task_kind as enum (
  'planning', 'routine', 'complex_code', 'review', 'research'
);

-- One global monthly cap (ADR 0007). extended_until lifts the hard stop without raising the cap.
create table public.spend_caps (
  scope text primary key default 'global' check (scope = 'global'),
  monthly_usd numeric(12, 2) not null default 20 check (monthly_usd > 0),
  extended_until timestamptz,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.spend_caps (scope, monthly_usd) values ('global', 20);

-- Provisional defaults. They are not benchmark winners; see the results note dated 2026-11-03.
create table public.model_routes (
  task_kind public.model_task_kind primary key,
  provider public.model_provider not null,
  model text not null check (char_length(model) between 1 and 120),
  updated_at timestamptz not null default now()
);

insert into public.model_routes (task_kind, provider, model) values
  ('planning', 'anthropic', 'claude-sonnet-5-5'),
  ('routine', 'openai', 'gpt-6-luna'),
  ('complex_code', 'anthropic', 'claude-sonnet-5-5'),
  ('review', 'openai', 'gpt-6.1-sol'),
  ('research', 'openai', 'gpt-6.1-sol');

create table public.project_model_settings (
  project_id uuid primary key references public.projects (id) on delete cascade,
  monthly_budget_usd numeric(12, 2) not null default 5 check (monthly_budget_usd >= 0),
  run_budget_usd numeric(12, 2) not null default 0.25 check (run_budget_usd >= 0),
  -- ADR 0018: no lock-in by default. Every provider is allowed and a failing or declining one
  -- falls back to the next; the owner narrows either per project (e.g. for client privacy).
  allow_fallback boolean not null default true,
  allowed_providers public.model_provider[] not null
    default '{anthropic,openai,gemini,xai,deepseek,groq,openrouter}',
  extended_until timestamptz,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  task_id uuid references public.tasks (id) on delete set null,
  -- Agent runs arrive in Sprint 6. The id is recorded now so those rows can point back here.
  run_id uuid,
  provider public.model_provider not null,
  model text not null check (char_length(model) between 1 and 120),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cached_tokens integer not null default 0 check (cached_tokens >= 0),
  image_count integer not null default 0 check (image_count >= 0),
  cost_usd_micros bigint not null check (cost_usd_micros >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  fx_rate numeric(14, 6) not null default 1 check (fx_rate > 0),
  ok boolean not null,
  error text check (error is null or char_length(error) <= 80),
  fallback_from_provider public.model_provider,
  fallback_from_model text check (
    fallback_from_model is null or char_length(fallback_from_model) <= 120
  ),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  created_at timestamptz not null default now()
);

create index usage_ledger_project_idx on public.usage_ledger (project_id, created_at desc);
create index usage_ledger_created_idx on public.usage_ledger (created_at desc);

insert into public.project_model_settings (project_id)
select id from public.projects
on conflict do nothing;

create function private.seed_model_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_model_settings (project_id) values (new.id);
  return new;
end;
$$;

revoke execute on function private.seed_model_settings() from public, anon, authenticated;

create trigger projects_seed_model_settings
  after insert on public.projects
  for each row execute function private.seed_model_settings();

create trigger spend_caps_version before update on public.spend_caps
  for each row execute function private.bump_version();
create trigger project_model_settings_version before update on public.project_model_settings
  for each row execute function private.bump_version();

-- ---------------------------------------------------------------- privileges and RLS

alter table public.spend_caps enable row level security;
alter table public.model_routes enable row level security;
alter table public.project_model_settings enable row level security;
alter table public.usage_ledger enable row level security;

revoke all on public.spend_caps, public.model_routes, public.project_model_settings,
  public.usage_ledger from anon, authenticated;
grant select on public.spend_caps, public.model_routes, public.project_model_settings,
  public.usage_ledger to authenticated;

create policy "owners read spend caps" on public.spend_caps
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid()) and m.role = 'owner'
  ));

create policy "owners read model routes" on public.model_routes
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid()) and m.role = 'owner'
  ));

create policy "owners read project model settings" on public.project_model_settings
  for select to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]));

create policy "owners read usage ledger" on public.usage_ledger
  for select to authenticated
  using (private.has_project_role(project_id, array['owner']::public.membership_role[]));
