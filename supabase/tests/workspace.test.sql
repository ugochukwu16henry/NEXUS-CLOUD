-- pgTAP: Sprint 4 workspace. Change sets, changed files, attachments, upload batches and the two
-- storage buckets: owner-only reads, no browser writes, and the rules the database itself enforces.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

-- ---------------------------------------------------------------- fixtures (as postgres)
delete from public.memberships where role = 'owner';

insert into public.signup_allowlist (email, reason) values
  ('owner@ws.test', 'test'), ('client@ws.test', 'test');
insert into auth.users (id, email) values
  ('22000000-0000-0000-0000-00000000000a', 'owner@ws.test'),
  ('22000000-0000-0000-0000-00000000000b', 'client@ws.test');
insert into public.workspaces (id, name) values ('32000000-0000-0000-0000-000000000001', 'WS');
insert into public.memberships (workspace_id, user_id, role) values
  ('32000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-00000000000a', 'owner'),
  ('32000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-00000000000b', 'client');
insert into public.projects (id, workspace_id, name)
  values ('42000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 'Pilot');
insert into public.tasks (id, project_id, title)
  values ('72000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', 'Login');
insert into public.integrations (id, workspace_id, installation_id, account_login, account_type, repository_selection)
  values ('82000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 5252, 'org',
          'Organization', 'selected');
insert into public.repositories (id, project_id, integration_id, github_repo_id, full_name, default_branch, private, html_url)
  values ('92000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001',
          '82000000-0000-0000-0000-000000000001', 7001, 'org/app', 'main', true, 'https://github.com/org/app');
insert into public.changesets (id, project_id, repository_id, task_id, branch, base_sha)
  values ('a2000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001',
          '92000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001',
          'task/NX-1-login', repeat('a', 40));
insert into public.changeset_files (changeset_id, path, change, storage_key, size_bytes)
  values ('a2000000-0000-0000-0000-000000000001', 'src/app.ts', 'modify',
          'a2000000-0000-0000-0000-000000000001/x', 10);
insert into public.artifacts (project_id, task_id, kind, filename, content_type, size_bytes, sha256, storage_key)
  values ('42000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'image',
          'shot.png', 'image/png', 100, repeat('b', 64), '42000000-0000-0000-0000-000000000001/y');
insert into public.workspace_settings (project_id) values ('42000000-0000-0000-0000-000000000001');
insert into public.upload_batches (project_id, task_id, target, files)
  values ('42000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'worktree', '[]');

-- ---------------------------------------------------------------- rules the database enforces

select throws_ok(
  $$insert into public.changesets (project_id, repository_id, task_id, branch, base_sha)
    values ('42000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001',
            '72000000-0000-0000-0000-000000000001', 'task/NX-1-again', repeat('c', 40))$$,
  '23505', null, 'a task has at most one open change set'
);
select throws_ok(
  $$insert into public.changesets (project_id, repository_id, task_id, branch, base_sha)
    values ('42000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001',
            '72000000-0000-0000-0000-000000000001', 'main', repeat('c', 40))$$,
  '23514', null, 'change sets can only target task branches (never main)'
);
select throws_ok(
  $$insert into public.changeset_files (changeset_id, path, change, storage_key)
    values ('a2000000-0000-0000-0000-000000000001', '../escape.txt', 'add', 'a2000000-0000-0000-0000-000000000001/z')$$,
  '23514', null, 'paths cannot climb out of the repository'
);
select throws_ok(
  $$insert into public.changeset_files (changeset_id, path, change, storage_key)
    values ('a2000000-0000-0000-0000-000000000001', '/etc/passwd', 'add', 'a2000000-0000-0000-0000-000000000001/z')$$,
  '23514', null, 'paths cannot be absolute'
);
select throws_ok(
  $$insert into public.changeset_files (changeset_id, path, change)
    values ('a2000000-0000-0000-0000-000000000001', 'new.txt', 'add')$$,
  '23514', null, 'an added file must have stored contents'
);
select throws_ok(
  $$insert into public.artifacts (project_id, kind, filename, content_type, size_bytes, sha256, storage_key)
    values ('42000000-0000-0000-0000-000000000001', 'image', '../x.png', 'image/png', 1, repeat('b', 64), 'k')$$,
  '23514', null, 'attachment names cannot contain folders'
);
select throws_ok(
  $$update public.workspace_settings set max_files = 100000$$,
  '23514', null, 'workspace limits stay within their bounds'
);
select ok(
  not (select public from storage.buckets where id = 'workspace')
    and not (select public from storage.buckets where id = 'attachments'),
  'both storage buckets are private'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and (qual like '%workspace%' or qual like '%attachments%' or with_check like '%workspace%' or with_check like '%attachments%')),
  0,
  'no storage policy opens the buckets to browser roles (signed URLs only)'
);

-- ---------------------------------------------------------------- owner: read only

set local role authenticated;
set local request.jwt.claims to '{"sub":"22000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is((select count(*)::int from public.changesets), 1, 'owner sees the change set');
select is((select count(*)::int from public.changeset_files), 1, 'owner sees changed files');
select is((select count(*)::int from public.artifacts), 1, 'owner sees attachments');
select is((select count(*)::int from public.workspace_settings), 1, 'owner sees workspace settings');
select throws_ok(
  $$select * from public.upload_batches$$,
  '42501', null, 'upload batches are server bookkeeping only'
);
select throws_ok(
  $$update public.changesets set status = 'committed'$$,
  '42501', null, 'owner cannot change a change set from the browser'
);
select throws_ok(
  $$insert into public.changeset_files (changeset_id, path, change, storage_key)
    values ('a2000000-0000-0000-0000-000000000001', 'x.txt', 'add', 'a2000000-0000-0000-0000-000000000001/q')$$,
  '42501', null, 'owner cannot add files to a change set from the browser'
);
select throws_ok(
  $$insert into public.artifacts (project_id, kind, filename, content_type, size_bytes, sha256, storage_key)
    values ('42000000-0000-0000-0000-000000000001', 'image', 'a.png', 'image/png', 1, repeat('b', 64), 'k2')$$,
  '42501', null, 'owner cannot register attachments from the browser'
);
select throws_ok(
  $$update public.workspace_settings set max_files = 10$$,
  '42501', null, 'owner changes settings only through the server action'
);

-- ---------------------------------------------------------------- client: sees nothing

set local request.jwt.claims to '{"sub":"22000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is((select count(*)::int from public.changesets), 0, 'clients see no change sets');
select is((select count(*)::int from public.changeset_files), 0, 'clients see no changed files');
select is((select count(*)::int from public.artifacts), 0, 'clients see no attachments');
select is((select count(*)::int from public.workspace_settings), 0, 'clients see no workspace settings');

-- ---------------------------------------------------------------- anonymous

reset role;
select ok(
  not has_table_privilege('anon', 'public.changesets', 'select')
    and not has_table_privilege('anon', 'public.changeset_files', 'select')
    and not has_table_privilege('anon', 'public.artifacts', 'select'),
  'anonymous users have no access to workspace tables'
);
select ok(
  not has_table_privilege('authenticated', 'public.upload_batches', 'select'),
  'no browser role can read upload batches'
);

select * from finish();
rollback;
