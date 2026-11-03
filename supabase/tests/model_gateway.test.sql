-- pgTAP: Sprint 5 ledger, caps and routes. Owner-only reads, no browser writes, and the
-- checks that keep a bad cost or an unknown provider out of the ledger.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

delete from public.memberships where role = 'owner';

insert into public.signup_allowlist (email, reason) values
  ('owner@model.test', 'test'), ('client@model.test', 'test');
insert into auth.users (id, email) values
  ('23000000-0000-0000-0000-00000000000a', 'owner@model.test'),
  ('23000000-0000-0000-0000-00000000000b', 'client@model.test');
insert into public.workspaces (id, name) values ('33000000-0000-0000-0000-000000000001', 'Models');
insert into public.memberships (workspace_id, user_id, role) values
  ('33000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-00000000000a', 'owner'),
  ('33000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-00000000000b', 'client');
insert into public.projects (id, workspace_id, name)
  values ('43000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', 'Pilot');
insert into public.usage_ledger (project_id, provider, model, cost_usd_micros, ok)
  values ('43000000-0000-0000-0000-000000000001', 'openai', 'gpt-6-luna', 1000, true);

select is(
  (select monthly_budget_usd::text from public.project_model_settings
    where project_id = '43000000-0000-0000-0000-000000000001'),
  '5.00',
  'a new project gets the default model budget'
);
select is(
  (select model from public.model_routes where task_kind = 'planning'),
  'claude-sonnet-5-5',
  'planning has a provisional default model'
);
select throws_ok(
  $$insert into public.usage_ledger (project_id, provider, model, cost_usd_micros, ok)
    values ('43000000-0000-0000-0000-000000000001', 'openai', 'gpt-6-luna', -1, true)$$,
  '23514', null, 'a ledger row cannot have a negative cost'
);
select throws_ok(
  $$insert into public.usage_ledger (project_id, provider, model, cost_usd_micros, ok)
    values ('43000000-0000-0000-0000-000000000001', 'nope', 'x', 1, true)$$,
  '22P02', null, 'an unknown provider is rejected'
);

-- ---------------------------------------------------------------- owner: read only

set local role authenticated;
set local request.jwt.claims to '{"sub":"23000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is((select count(*)::int from public.usage_ledger), 1, 'owner sees the ledger row');
select is((select count(*)::int from public.project_model_settings), 1, 'owner sees model settings');
select is((select monthly_usd::text from public.spend_caps), '20.00', 'owner sees the global cap');
select is((select count(*)::int from public.model_routes), 5, 'owner sees every task route');
select throws_ok(
  $$insert into public.usage_ledger (project_id, provider, model, cost_usd_micros, ok)
    values ('43000000-0000-0000-0000-000000000001', 'openai', 'gpt-6-luna', 1, true)$$,
  '42501', null, 'the browser cannot write the ledger'
);
select throws_ok(
  $$update public.spend_caps set monthly_usd = 100$$,
  '42501', null, 'the browser cannot raise the global cap'
);

-- ---------------------------------------------------------------- client: sees nothing

set local request.jwt.claims to '{"sub":"23000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is((select count(*)::int from public.usage_ledger), 0, 'clients see no ledger rows');
select is((select count(*)::int from public.spend_caps), 0, 'clients see no spend cap');

select * from finish();
rollback;
