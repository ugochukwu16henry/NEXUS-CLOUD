-- pgTAP: Sprint 6 agent runs. Owner-only reads, no browser writes, budget must be positive.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

delete from public.memberships where role = 'owner';

insert into public.signup_allowlist (email, reason) values
  ('owner@agent.test', 'test'), ('client@agent.test', 'test');
insert into auth.users (id, email) values
  ('24000000-0000-0000-0000-00000000000a', 'owner@agent.test'),
  ('24000000-0000-0000-0000-00000000000b', 'client@agent.test');
insert into public.workspaces (id, name) values ('34000000-0000-0000-0000-000000000001', 'Agents');
insert into public.memberships (workspace_id, user_id, role) values
  ('34000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-00000000000a', 'owner'),
  ('34000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-00000000000b', 'client');
insert into public.projects (id, workspace_id, name)
  values ('44000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 'Pilot');
insert into public.tasks (id, project_id, title)
  values ('54000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000001', 'Login form');

insert into public.agent_runs (
  id, project_id, task_id, kind, purpose, stop_condition, budget_usd_micros, max_iterations, idempotency_key
) values (
  '64000000-0000-0000-0000-000000000001',
  '44000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000001',
  'planner',
  'Plan the login form',
  'stop when the plan is approved',
  250000,
  8,
  'idem-test-1'
);

insert into public.workspace_settings (project_id)
  values ('44000000-0000-0000-0000-000000000001');
select is(
  (select approval_mode::text from public.workspace_settings
    where project_id = '44000000-0000-0000-0000-000000000001'),
  'safe_list',
  'command approval defaults to the safe list'
);
select is(
  (select terminal_idle_seconds from public.workspace_settings
    where project_id = '44000000-0000-0000-0000-000000000001'),
  900,
  'the terminal idles out after 15 minutes'
);
select is(
  (select status::text from public.agent_runs where id = '64000000-0000-0000-0000-000000000001'),
  'queued',
  'a new run starts queued'
);
select throws_ok(
  $$insert into public.agent_runs (
      project_id, task_id, kind, purpose, stop_condition, budget_usd_micros, max_iterations, idempotency_key
    ) values (
      '44000000-0000-0000-0000-000000000001',
      '54000000-0000-0000-0000-000000000001',
      'coder', 'x', 'stop', 0, 8, 'idem-test-2'
    )$$,
  '23514', null, 'a run needs a positive budget'
);

insert into public.command_approvals (run_id, project_id, command) values
  ('64000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000001', 'node a.mjs');
select throws_ok(
  $$insert into public.command_approvals (run_id, project_id, command) values
    ('64000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000001', 'node b.mjs')$$,
  '23505', null, 'a run waits on one command at a time'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"24000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is(
  (select purpose from public.agent_runs where id = '64000000-0000-0000-0000-000000000001'),
  'Plan the login form',
  'owner reads the run columns'
);
select throws_ok(
  'select state from public.agent_runs',
  '42501', null, 'the saved agent conversation is not readable from the browser'
);

select is(
  (select count(*)::int from public.agent_runs),
  1,
  'owner sees the run'
);
select throws_ok(
  $$insert into public.agent_runs (
      project_id, task_id, kind, purpose, stop_condition, budget_usd_micros, max_iterations, idempotency_key
    ) values (
      '44000000-0000-0000-0000-000000000001',
      '54000000-0000-0000-0000-000000000001',
      'coder', 'x', 'stop', 1000, 8, 'idem-browser'
    )$$,
  '42501', null, 'the browser cannot insert a run'
);

set local request.jwt.claims to '{"sub":"24000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is(
  (select count(*)::int from public.agent_runs),
  0,
  'a client sees no runs'
);
select throws_ok(
  'select count(*) from public.sandbox_sessions',
  '42501', null, 'terminal tickets are not readable from the browser'
);

select * from finish();
rollback;
