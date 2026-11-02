-- pgTAP: Sprint 2 project cockpit (projects, requirements, milestones, tasks, dependencies).
-- Covers access rules, the workflow state machine, references, versioning and history.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(42);

-- ---------------------------------------------------------------- fixtures (as postgres)
delete from public.memberships where role = 'owner';

insert into public.signup_allowlist (email, reason) values
  ('owner@cockpit.test', 'test'), ('client@cockpit.test', 'test'), ('outsider@cockpit.test', 'test');
insert into auth.users (id, email) values
  ('20000000-0000-0000-0000-00000000000a', 'owner@cockpit.test'),
  ('20000000-0000-0000-0000-00000000000b', 'client@cockpit.test'),
  ('20000000-0000-0000-0000-00000000000d', 'outsider@cockpit.test');
insert into public.workspaces (id, name) values ('30000000-0000-0000-0000-000000000001', 'Cockpit');
insert into public.memberships (workspace_id, user_id, role) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'owner'),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b', 'client');

-- ---------------------------------------------------------------- owner builds a project

set local role authenticated;
set local request.jwt.claims to '{"sub":"20000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$insert into public.projects (id, workspace_id, name, budget_usd)
    values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Pilot', 100)$$,
  'owner creates a project'
);
insert into public.projects (id, workspace_id, name)
  values ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Other');

insert into public.requirements (id, project_id, title, statement)
  values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Reset', 'Users can reset passwords');
insert into public.requirements (project_id, title, statement)
  values ('40000000-0000-0000-0000-000000000001', 'Audit', 'Resets are audited');
select results_eq(
  $$select ref from public.requirements where project_id = '40000000-0000-0000-0000-000000000001' order by ref$$,
  array[1, 2],
  'requirements get sequential references per project'
);

insert into public.milestones (id, project_id, title)
  values ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Auth MVP');
insert into public.milestones (id, project_id, title)
  values ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Elsewhere');

insert into public.tasks (id, project_id, title, requirement_id, milestone_id) values
  ('70000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Token table',
   '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'Reset endpoint', null, null),
  ('70000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'Reset E2E', null, null);
insert into public.tasks (id, project_id, title)
  values ('70000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000002', 'Other task');

select results_eq(
  $$select ref from public.tasks where project_id = '40000000-0000-0000-0000-000000000001' order by ref$$,
  array[1, 2, 3],
  'tasks get sequential references per project'
);
select is(
  (select ref from public.tasks where id = '70000000-0000-0000-0000-000000000009'),
  1,
  'each project numbers its tasks from 1'
);

select throws_ok(
  $$insert into public.tasks (project_id, title, state) values ('40000000-0000-0000-0000-000000000001', 'Sneaky', 'approved')$$,
  'P0001', 'New tasks start in Backlog or Ready',
  'new tasks cannot start in a late state'
);
select throws_ok(
  $$insert into public.tasks (project_id, title, milestone_id)
    values ('40000000-0000-0000-0000-000000000001', 'Cross link', '60000000-0000-0000-0000-000000000002')$$,
  'P0001', 'Milestone belongs to another project',
  'tasks cannot link to another project''s milestone'
);

-- ---------------------------------------------------------------- column privileges and deletes

select throws_ok(
  $$update public.tasks set ref = 99 where id = '70000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'references are not writable'
);
select throws_ok(
  $$update public.tasks set version = 99 where id = '70000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'versions are not writable'
);
select throws_ok(
  $$update public.projects set next_task_number = 1 where id = '40000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'project counters are not writable'
);
select throws_ok(
  $$delete from public.tasks where id = '70000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'tasks cannot be deleted'
);
select throws_ok(
  $$delete from public.projects where id = '40000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'projects cannot be deleted (archive instead)'
);
select throws_ok(
  $$insert into public.requirement_versions (requirement_id, version, snapshot)
    values ('50000000-0000-0000-0000-000000000001', 9, '{}')$$,
  '42501', null, 'requirement history cannot be forged'
);

-- ---------------------------------------------------------------- versioning and requirement history

select is(
  (select version from public.projects where id = '40000000-0000-0000-0000-000000000001'),
  1, 'adding tasks and requirements does not change the project version'
);
update public.projects set budget_usd = 150 where id = '40000000-0000-0000-0000-000000000001';
select is(
  (select version from public.projects where id = '40000000-0000-0000-0000-000000000001'),
  2, 'editing the project bumps the version'
);

update public.requirements set approval = 'approved' where id = '50000000-0000-0000-0000-000000000001';
select is(
  (select approved_by from public.requirements where id = '50000000-0000-0000-0000-000000000001'),
  '20000000-0000-0000-0000-00000000000a'::uuid,
  'approval records who approved'
);
select is(
  (select count(*)::int from public.requirement_versions where requirement_id = '50000000-0000-0000-0000-000000000001'),
  0, 'approving does not create a content version'
);

update public.requirements set statement = 'Users can reset passwords by email'
  where id = '50000000-0000-0000-0000-000000000001';
select is(
  (select approval::text from public.requirements where id = '50000000-0000-0000-0000-000000000001'),
  'draft', 'changing approved content sends it back to draft'
);
select is(
  (select approved_by from public.requirements where id = '50000000-0000-0000-0000-000000000001'),
  null::uuid, 'and clears the approver'
);
select is(
  (select snapshot ->> 'statement' from public.requirement_versions
   where requirement_id = '50000000-0000-0000-0000-000000000001' and version = 2),
  'Users can reset passwords', 'the previous version is kept in history'
);
select is(
  (select version from public.requirements where id = '50000000-0000-0000-0000-000000000001'),
  3, 'the requirement is now on version 3'
);

-- ---------------------------------------------------------------- dependencies

select lives_ok(
  $$insert into public.task_dependencies (task_id, depends_on_id) values
    ('70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001'),
    ('70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000002')$$,
  'owner adds a dependency chain'
);
select throws_ok(
  $$insert into public.task_dependencies (task_id, depends_on_id)
    values ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003')$$,
  'P0001', 'Dependency would create a cycle',
  'an indirect cycle is rejected'
);
select throws_ok(
  $$insert into public.task_dependencies (task_id, depends_on_id)
    values ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001')$$,
  'P0001', 'Dependency would create a cycle', 'a task cannot depend on itself'
);
select throws_ok(
  $$insert into public.task_dependencies (task_id, depends_on_id)
    values ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000009')$$,
  'P0001', 'Dependencies must be in the same project',
  'dependencies cannot cross projects'
);

-- ---------------------------------------------------------------- workflow state machine

select throws_ok(
  $$update public.tasks set state = 'deployed' where id = '70000000-0000-0000-0000-000000000001'$$,
  'P0001', 'invalid transition: backlog to deployed',
  'states cannot be skipped'
);
select lives_ok(
  $$update public.tasks set state = 'ready' where id in ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002')$$,
  'backlog to ready'
);
select throws_ok(
  $$update public.tasks set state = 'in_progress' where id = '70000000-0000-0000-0000-000000000002'$$,
  'P0001', 'Dependencies are not done',
  'work cannot start while a dependency is open'
);
select throws_ok(
  $$update public.tasks set state = 'backlog' where id = '70000000-0000-0000-0000-000000000001'$$,
  'P0001', 'invalid transition: ready to backlog',
  'tasks cannot move backwards'
);
select throws_ok(
  $$update public.tasks set state = 'blocked' where id = '70000000-0000-0000-0000-000000000001'$$,
  'P0001', 'A blocked task needs a reason',
  'blocking needs a reason'
);
select lives_ok(
  $$update public.tasks set state = 'blocked', blocked_reason = 'Waiting on design'
    where id = '70000000-0000-0000-0000-000000000001'$$,
  'blocking with a reason works'
);
select throws_ok(
  $$update public.tasks set state = 'approved' where id = '70000000-0000-0000-0000-000000000001'$$,
  'P0001', 'invalid transition: blocked tasks return to in_progress',
  'a blocked task can only return to In Progress'
);
select lives_ok(
  $$update public.tasks set state = 'in_progress' where id = '70000000-0000-0000-0000-000000000001'$$,
  'unblocking returns the task to In Progress'
);
select is(
  (select blocked_reason from public.tasks where id = '70000000-0000-0000-0000-000000000001'),
  null, 'unblocking clears the reason'
);

-- Walk task 1 through the rest of the workflow to Verified.
do $$
declare
  next_state public.workflow_state;
begin
  foreach next_state in array array['agent_complete', 'automated_checks', 'needs_human_review',
    'approved', 'preview_ready', 'client_review', 'release_approved', 'deployed', 'verified']::public.workflow_state[]
  loop
    update public.tasks set state = next_state where id = '70000000-0000-0000-0000-000000000001';
  end loop;
end;
$$;
select is(
  (select state::text from public.tasks where id = '70000000-0000-0000-0000-000000000001'),
  'verified', 'a task can walk every step to Verified'
);
select lives_ok(
  $$update public.tasks set state = 'in_progress' where id = '70000000-0000-0000-0000-000000000002'$$,
  'work starts once the dependency is verified'
);

update public.tasks set state = 'closed' where id = '70000000-0000-0000-0000-000000000001';
select throws_ok(
  $$update public.tasks set state = 'blocked', blocked_reason = 'x' where id = '70000000-0000-0000-0000-000000000001'$$,
  'P0001', 'invalid transition: closed tasks cannot be blocked',
  'closed tasks cannot be blocked'
);

reset role;

-- ---------------------------------------------------------------- other roles see nothing

set local role authenticated;
set local request.jwt.claims to '{"sub":"20000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from public.projects), 0, 'clients cannot see projects yet (portal is Sprint 9)');
select is((select count(*)::int from public.tasks), 0, 'clients cannot see tasks');
select throws_ok(
  $$insert into public.projects (workspace_id, name) values ('30000000-0000-0000-0000-000000000001', 'Client project')$$,
  '42501', null, 'clients cannot create projects'
);
update public.tasks set title = 'hijacked' where id = '70000000-0000-0000-0000-000000000002';
reset role;
select is(
  (select title from public.tasks where id = '70000000-0000-0000-0000-000000000002'),
  'Reset endpoint', 'clients cannot update tasks'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"20000000-0000-0000-0000-00000000000d","role":"authenticated"}';
select is(
  (select count(*)::int from public.requirements) + (select count(*)::int from public.milestones)
    + (select count(*)::int from public.task_dependencies) + (select count(*)::int from public.requirement_versions),
  0, 'outsiders see no project data'
);
reset role;

set local role anon;
select throws_ok('select * from public.tasks', '42501', null, 'anon cannot read tasks');
reset role;

select * from finish();
rollback;
