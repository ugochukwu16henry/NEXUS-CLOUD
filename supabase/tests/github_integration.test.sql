-- pgTAP: Sprint 3 GitHub integration. Who can read integration data (owner only), that nobody can
-- write it from the browser, that deliveries are stored once, and how the retry queue claims work.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(32);

-- ---------------------------------------------------------------- fixtures (as postgres)
delete from public.memberships where role = 'owner';

insert into public.signup_allowlist (email, reason) values
  ('owner@github.test', 'test'), ('client@github.test', 'test');
insert into auth.users (id, email) values
  ('21000000-0000-0000-0000-00000000000a', 'owner@github.test'),
  ('21000000-0000-0000-0000-00000000000b', 'client@github.test');
insert into public.workspaces (id, name) values ('31000000-0000-0000-0000-000000000001', 'GitHub WS');
insert into public.memberships (workspace_id, user_id, role) values
  ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-00000000000a', 'owner'),
  ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-00000000000b', 'client');
insert into public.projects (id, workspace_id, name)
  values ('41000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'Pilot');
insert into public.tasks (id, project_id, title)
  values ('71000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'Login');

insert into public.integrations (id, workspace_id, installation_id, account_login, account_type, repository_selection)
  values ('81000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 9424201,
          'nexus-test-org', 'Organization', 'selected');
insert into public.repositories (id, project_id, integration_id, github_repo_id, full_name, default_branch, private, html_url)
  values ('91000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001',
          '81000000-0000-0000-0000-000000000001', 9900101, 'nexus-test-org/nexus-pilot-app', 'main', true,
          'https://github.com/nexus-test-org/nexus-pilot-app');
insert into public.repo_branches (repository_id, name, head_sha)
  values ('91000000-0000-0000-0000-000000000001', 'task/NX-1-login', repeat('a', 40));
insert into public.repo_commits (repository_id, sha, branch, message)
  values ('91000000-0000-0000-0000-000000000001', repeat('a', 40), 'task/NX-1-login', 'NX-1: login form');
insert into public.repo_pull_requests (repository_id, number, title, state, head_ref, head_sha, base_ref, html_url)
  values ('91000000-0000-0000-0000-000000000001', 7, 'NX-1 login', 'open', 'task/NX-1-login', repeat('a', 40),
          'main', 'https://github.com/nexus-test-org/nexus-pilot-app/pull/7');
insert into public.task_links (task_id, repository_id, kind, ref)
  values ('71000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'branch', 'task/NX-1-login');
insert into public.webhook_events (delivery_id, event, payload)
  values ('pgtap-delivery-1', 'push', '{"secret":"payload body"}');

-- ---------------------------------------------------------------- data rules (as postgres)

select throws_ok(
  $$insert into public.webhook_events (delivery_id, event, payload)
    values ('pgtap-delivery-1', 'push', '{}')$$,
  '23505', null, 'a delivery ID is stored only once (replays are recognised)'
);
select throws_ok(
  $$insert into public.repositories (project_id, integration_id, github_repo_id, full_name, default_branch, private, html_url)
    values ('41000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 9002,
            'nexus-test-org/second', 'main', false, 'https://github.com/nexus-test-org/second')$$,
  '23505', null, 'a project has at most one repository'
);
select throws_ok(
  $$insert into public.repo_branches (repository_id, name, head_sha)
    values ('91000000-0000-0000-0000-000000000001', 'bad', 'not-a-sha')$$,
  '23514', null, 'commit SHAs must be 40 hex characters'
);
select throws_ok(
  $$insert into public.repositories (project_id, integration_id, github_repo_id, full_name, default_branch, private, html_url)
    values ('41000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 9003,
            'not a repo name', 'main', false, 'https://github.com/x')$$,
  '23514', null, 'repository names must look like owner/name'
);

-- ---------------------------------------------------------------- privileges (checked, not called)
-- Calling a denied function after SET ROLE crashes the local Postgres image (threat model,
-- Sprint 1), so execute rights are asserted with has_function_privilege.

select ok(
  not has_function_privilege('authenticated', 'public.claim_webhook_events(integer, text)', 'execute'),
  'signed-in users cannot claim webhook deliveries'
);
select ok(
  not has_function_privilege('anon', 'public.claim_webhook_events(integer, text)', 'execute'),
  'anonymous users cannot claim webhook deliveries'
);
select ok(
  has_function_privilege('service_role', 'public.claim_webhook_events(integer, text)', 'execute'),
  'the server (secret key) can claim deliveries'
);
select ok(
  not has_table_privilege('anon', 'public.integrations', 'select')
    and not has_table_privilege('anon', 'public.repositories', 'select')
    and not has_table_privilege('anon', 'public.webhook_events', 'select'),
  'anonymous users have no access to integration tables'
);
select ok(
  not has_column_privilege('authenticated', 'public.webhook_events', 'payload', 'select'),
  'nobody reads raw webhook payloads from the browser'
);

-- ---------------------------------------------------------------- owner: read only

set local role authenticated;
set local request.jwt.claims to '{"sub":"21000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is((select count(*)::int from public.integrations), 1, 'owner sees the integration');
select is((select count(*)::int from public.repositories), 1, 'owner sees the repository');
select is((select count(*)::int from public.repo_branches), 1, 'owner sees branches');
select is((select count(*)::int from public.repo_commits), 1, 'owner sees commits');
select is((select count(*)::int from public.repo_pull_requests), 1, 'owner sees pull requests');
select is((select count(*)::int from public.task_links), 1, 'owner sees task links');
select is(
  (select delivery_id from public.webhook_events where delivery_id = 'pgtap-delivery-1'),
  'pgtap-delivery-1',
  'owner sees delivery status for the dead-letter view'
);
select throws_ok(
  $$select payload from public.webhook_events$$,
  '42501', null, 'owner cannot read raw payloads'
);
select throws_ok(
  $$update public.integrations set status = 'active'$$,
  '42501', null, 'owner cannot change integrations from the browser'
);
select throws_ok(
  $$insert into public.repositories (project_id, integration_id, github_repo_id, full_name, default_branch, private, html_url)
    values ('41000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 1,
            'a/b', 'main', false, 'https://github.com/a/b')$$,
  '42501', null, 'owner cannot insert repositories from the browser'
);
select throws_ok(
  $$insert into public.task_links (task_id, repository_id, kind, ref)
    values ('71000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'commit', 'x')$$,
  '42501', null, 'owner cannot forge task links'
);
select throws_ok(
  $$insert into public.webhook_events (delivery_id, event, payload) values ('forged', 'push', '{}')$$,
  '42501', null, 'nobody can insert webhook deliveries from the browser'
);
select throws_ok(
  $$update public.webhook_events set status = 'processed'$$,
  '42501', null, 'nobody can mark deliveries processed from the browser'
);

-- ---------------------------------------------------------------- client: sees nothing

set local request.jwt.claims to '{"sub":"21000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is((select count(*)::int from public.integrations), 0, 'clients see no integrations');
select is((select count(*)::int from public.repositories), 0, 'clients see no repositories');
select is((select count(*)::int from public.repo_commits), 0, 'clients see no commits');
select is((select count(*)::int from public.task_links), 0, 'clients see no task links');
select is((select count(*)::int from public.webhook_events), 0, 'clients see no deliveries');

-- ---------------------------------------------------------------- the retry queue (as postgres)

reset role;
insert into public.webhook_events (delivery_id, event, payload, next_attempt_at)
  values ('pgtap-delivery-2', 'push', '{}', now() + interval '1 hour');

select is(
  (select count(*)::int from public.claim_webhook_events(10)),
  1,
  'only due deliveries are claimed (the future retry waits)'
);
select is(
  (select attempts from public.webhook_events where delivery_id = 'pgtap-delivery-1'),
  1,
  'claiming counts an attempt and marks it processing'
);
select is(
  (select count(*)::int from public.claim_webhook_events(10)),
  0,
  'a delivery being processed is not claimed twice'
);

update public.webhook_events set locked_at = now() - interval '11 minutes'
  where delivery_id = 'pgtap-delivery-1';
select is(
  (select attempts from public.claim_webhook_events(10)),
  2,
  'a delivery stuck in processing (crashed worker) is claimed again'
);

update public.webhook_events set status = 'pending', next_attempt_at = now()
  where delivery_id = 'pgtap-delivery-2';
select is(
  (select delivery_id from public.claim_webhook_events(10, 'pgtap-delivery-2')),
  'pgtap-delivery-2',
  'the webhook route can claim exactly its own delivery'
);

select * from finish();
rollback;
