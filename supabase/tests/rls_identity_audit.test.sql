-- pgTAP: access rules for Sprint 1 tables (test strategy 5.3, threat model T02/T05).
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(38);

-- ---------------------------------------------------------------- guard rails

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'every table in public has RLS enabled'
);

-- ---------------------------------------------------------------- fixtures (as postgres)
-- Independent of whatever is in the local database: the real owner (from E2E runs) is set aside
-- inside this transaction, which is rolled back at the end.
delete from public.memberships where role = 'owner';

insert into public.signup_allowlist (email, reason) values
  ('owner@pgtap.test', 'test'), ('client-a@pgtap.test', 'test'),
  ('client-b@pgtap.test', 'test'), ('outsider@pgtap.test', 'test');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@pgtap.test'),
  ('00000000-0000-0000-0000-00000000000b', 'client-a@pgtap.test'),
  ('00000000-0000-0000-0000-00000000000c', 'client-b@pgtap.test'),
  ('00000000-0000-0000-0000-00000000000d', 'outsider@pgtap.test');

insert into public.workspaces (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Main'),
  ('10000000-0000-0000-0000-000000000002', 'Other');

insert into public.memberships (workspace_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'client'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', 'client');

insert into public.audit_events (workspace_id, actor_id, actor_type, action, result, correlation_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'user', 'auth.sign_in', 'success', gen_random_uuid()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', 'user', 'auth.sign_in', 'success', gen_random_uuid()),
  (null, null, 'system', 'pgtap.system_event', 'success', gen_random_uuid());

-- ---------------------------------------------------------------- sign-up allowlist and profiles

select throws_ok(
  $$insert into auth.users (id, email) values (gen_random_uuid(), 'stranger@example.com')$$,
  'P0001', 'Sign-up is by invitation only',
  'sign-up is rejected for emails not on the allowlist'
);

select is(
  (select email from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'owner@pgtap.test',
  'a profile is created for each new user'
);

select throws_ok(
  $$insert into public.memberships (workspace_id, user_id, role)
    values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000d', 'owner')$$,
  '23505', null,
  'there can only be one owner'
);

-- ---------------------------------------------------------------- anonymous

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok('select * from public.workspaces', '42501', null, 'anon cannot read workspaces');
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.memberships', '42501', null, 'anon cannot read memberships');
select throws_ok('select * from public.audit_events', '42501', null, 'anon cannot read audit events');
select throws_ok('select * from public.signup_allowlist', '42501', null, 'anon cannot read the allowlist');
reset role;

-- Checked as a privilege rather than by calling it: in the local Postgres image, a denied function
-- call after `set role anon` crashes the backend. Through the REST API it returns 401 as expected.
select ok(
  not has_function_privilege('anon', 'public.my_sessions()', 'execute'),
  'anon cannot list sessions'
);

-- ---------------------------------------------------------------- owner

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select results_eq(
  'select name from public.workspaces',
  array['Main'],
  'owner sees only their workspace'
);
select is((select count(*)::int from public.memberships), 2, 'owner sees all memberships of their workspace');
select is((select count(*)::int from public.profiles), 2, 'owner sees their own and member profiles');
select is(
  (select count(*)::int from public.audit_events where workspace_id = '10000000-0000-0000-0000-000000000001'),
  1,
  'owner sees audit events of their workspace'
);
select is(
  (select count(*)::int from public.audit_events where workspace_id = '10000000-0000-0000-0000-000000000002'),
  0,
  'owner does not see audit events of another workspace'
);
select is(
  (select count(*)::int from public.audit_events where workspace_id is null and action = 'pgtap.system_event'),
  1,
  'owner sees system-level audit events'
);
select throws_ok(
  $$insert into public.audit_events (actor_type, action, result, correlation_id)
    values ('user', 'auth.sign_in', 'success', gen_random_uuid())$$,
  '42501', null,
  'owner cannot write audit events directly'
);
select throws_ok(
  $$insert into public.memberships (workspace_id, user_id, role)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000d', 'viewer')$$,
  '42501', null,
  'owner cannot add memberships from the browser'
);
select throws_ok('select * from public.signup_allowlist', '42501', null, 'owner cannot read the allowlist');

update public.profiles set display_name = 'Henry' where id = '00000000-0000-0000-0000-00000000000a';
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Henry',
  'users can update their own display name'
);
select throws_ok(
  $$update public.profiles set email = 'x@y.z' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null,
  'users cannot change their email through the profile'
);

reset role;

-- ---------------------------------------------------------------- client of workspace 1

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select results_eq('select name from public.workspaces', array['Main'], 'client sees only their workspace');
select is((select count(*)::int from public.memberships), 1, 'client sees only their own membership');
select is((select count(*)::int from public.profiles), 1, 'client sees only their own profile');
select is((select count(*)::int from public.audit_events), 0, 'client cannot read audit events');

update public.profiles set display_name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000a';
reset role;
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Henry',
  'users cannot update another user''s profile'
);

-- ---------------------------------------------------------------- client of workspace 2 (cross-tenant)

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select results_eq('select name from public.workspaces', array['Other'], 'client B sees only workspace 2');
select is(
  (select count(*)::int from public.workspaces where id = '10000000-0000-0000-0000-000000000001'),
  0,
  'client B cannot read workspace 1 by id'
);
select is(
  (select count(*)::int from public.memberships where workspace_id = '10000000-0000-0000-0000-000000000001'),
  0,
  'client B cannot read workspace 1 memberships'
);
select is((select count(*)::int from public.audit_events), 0, 'client B cannot read any audit events');

reset role;

-- ---------------------------------------------------------------- outsider (signed in, no membership)

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}';

select is((select count(*)::int from public.workspaces), 0, 'outsider sees no workspaces');
select is((select count(*)::int from public.memberships), 0, 'outsider sees no memberships');
select is((select count(*)::int from public.audit_events), 0, 'outsider sees no audit events');
select is((select count(*)::int from public.my_sessions()), 0, 'my_sessions returns only the caller''s sessions');

reset role;

-- ---------------------------------------------------------------- audit log is append-only for everyone

select throws_ok(
  'update public.audit_events set result = ''error''',
  'P0001', 'audit_events is append-only',
  'audit events cannot be updated, even by the table owner'
);
select throws_ok(
  'delete from public.audit_events',
  'P0001', 'audit_events is append-only',
  'audit events cannot be deleted, even by the table owner'
);
select throws_ok(
  'truncate public.audit_events',
  'P0001', 'audit_events is append-only',
  'audit events cannot be truncated'
);

set local role service_role;
select throws_ok(
  'update public.audit_events set result = ''error''',
  '42501', null,
  'the service role has no update privilege on audit events'
);
reset role;

select * from finish();
rollback;
