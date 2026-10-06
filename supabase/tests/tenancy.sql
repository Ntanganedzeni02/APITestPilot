-- Run against a disposable migrated database as its administrative test connection.
-- All authorization assertions execute as non-owner authenticated/anon roles.
\set ON_ERROR_STOP on
begin;
create temporary table test_results(label text not null);
grant select, insert on test_results to authenticated, anon;
create function pg_temp.assert_true(result boolean, label text) returns void language plpgsql as $$
begin
  if result is distinct from true then raise exception 'FAIL: %', label; end if;
  insert into pg_temp.test_results values (label);
end;
$$;
create function pg_temp.expect_error(command text, expected text, label text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute command; exception when others then actual := sqlstate; end;
  perform pg_temp.assert_true(actual = expected, label);
end;
$$;
insert into auth.users(id, email) values
 ('10000000-0000-0000-0000-000000000001', 'm12-a@example.invalid'),
 ('10000000-0000-0000-0000-000000000002', 'm12-b@example.invalid'),
 ('10000000-0000-0000-0000-000000000003', 'm12-c@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('test.workspace_a', public.create_workspace('Workspace A')::text, true);
select set_config('test.project_a', public.create_project(current_setting('test.workspace_a')::uuid, 'Project A')::text, true);
select pg_temp.assert_true((select count(*) = 1 from public.workspace_members where user_id = auth.uid() and role = 'OWNER'), 'creator receives OWNER');
select pg_temp.assert_true((select count(*) = 3 from public.environments), 'three environments created');
select pg_temp.assert_true((select array_agg(type order by type) = array['DEVELOPMENT','PRODUCTION','STAGING'] from public.environments), 'exact default types');
select pg_temp.assert_true((select count(*) = 2 from public.audit_logs where actor_id = auth.uid()), 'creation audit events persisted');
select pg_temp.assert_true((select count(*) = 1 from public.projects where created_by = auth.uid()), 'project actor derived from auth');
select pg_temp.expect_error('select public.create_workspace(''x'')', '23514', 'invalid workspace name rejected');
select pg_temp.expect_error('select public.create_project(current_setting(''test.workspace_a'')::uuid, ''x'')', '23514', 'invalid project name rejected');
select pg_temp.assert_true((select count(*) = 1 from public.projects), 'invalid creation leaves no project');
select pg_temp.expect_error('update public.workspace_members set role = ''ADMIN''', '42501', 'membership mutation denied');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select set_config('test.workspace_b', public.create_workspace('Workspace B')::text, true);
select set_config('test.project_b', public.create_project(current_setting('test.workspace_b')::uuid, 'Project B')::text, true);
select pg_temp.assert_true((select count(*) = 1 from public.workspaces), 'B reads only own workspace');
select pg_temp.assert_true((select count(*) = 1 from public.projects), 'B reads only own project');
select pg_temp.assert_true((select count(*) = 3 from public.environments), 'B reads only own environments');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select pg_temp.assert_true((select count(*) = 0 from public.workspaces where id = current_setting('test.workspace_b')::uuid), 'A cannot read B workspace with forged id');
select pg_temp.assert_true((select count(*) = 0 from public.workspace_members where workspace_id = current_setting('test.workspace_b')::uuid), 'A cannot read B membership');
select pg_temp.assert_true((select count(*) = 0 from public.projects where id = current_setting('test.project_b')::uuid), 'A cannot read B project with forged id');
select pg_temp.assert_true((select count(*) = 0 from public.environments where project_id = current_setting('test.project_b')::uuid), 'A cannot read B environments');
select pg_temp.assert_true((select count(*) = 0 from public.audit_logs where workspace_id = current_setting('test.workspace_b')::uuid), 'audit tenant isolation');
select pg_temp.assert_true(not public.is_workspace_member(current_setting('test.workspace_b')::uuid), 'helper cannot authorize forged id');
select pg_temp.expect_error('select public.create_project(current_setting(''test.workspace_b'')::uuid, ''Forged'')', '42501', 'cross-tenant RPC creation denied');
select pg_temp.expect_error('select public.create_project(''ffffffff-ffff-ffff-ffff-ffffffffffff''::uuid, ''Missing'')', '42501', 'missing workspace RPC denied');
select pg_temp.expect_error('update public.projects set name = ''Forged'' where id = current_setting(''test.project_b'')::uuid', '42501', 'unauthorized update privilege denied');
select pg_temp.expect_error('delete from public.projects where id = current_setting(''test.project_b'')::uuid', '42501', 'unauthorized delete privilege denied');
reset role;
-- Temporarily widen grants inside this rolled-back test to prove RLS independently.
grant insert, update, delete on public.projects, public.environments, public.workspace_members, public.audit_logs to authenticated;
set local role authenticated;
select pg_temp.expect_error('insert into public.projects(workspace_id, name, created_by) values (current_setting(''test.workspace_b'')::uuid, ''Forged'', auth.uid())', '42501', 'RLS blocks direct cross-tenant insert');
select pg_temp.expect_error('insert into public.workspace_members(workspace_id, user_id, role) values (current_setting(''test.workspace_b'')::uuid, auth.uid(), ''OWNER'')', '42501', 'RLS blocks self-enrollment');
select pg_temp.expect_error('insert into public.environments(project_id, type) values (current_setting(''test.project_b'')::uuid, ''STAGING'')', '42501', 'RLS blocks forged environment insert');
select pg_temp.expect_error('insert into public.audit_logs(workspace_id, actor_id, event) values (current_setting(''test.workspace_b'')::uuid, auth.uid(), ''WORKSPACE_CREATED'')', '42501', 'RLS blocks forged audit');
with changed as (update public.projects set name = 'Forged' where id = current_setting('test.project_b')::uuid returning id)
select pg_temp.assert_true((select count(*) = 0 from changed), 'RLS blocks unauthorized update independently');
with removed as (delete from public.projects where id = current_setting('test.project_b')::uuid returning id)
select pg_temp.assert_true((select count(*) = 0 from removed), 'RLS blocks unauthorized delete independently');
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true((select count(*) = 0 from public.workspaces), 'authenticated role without user sees nothing');
select pg_temp.expect_error('select public.create_workspace(''No user'')', '42501', 'workspace RPC requires authenticated user');
select pg_temp.expect_error('select public.create_project(current_setting(''test.workspace_a'')::uuid, ''No user'')', '42501', 'project RPC requires authenticated user');
set local role anon;
select pg_temp.expect_error('select * from public.workspaces', '42501', 'anonymous table access denied');
select pg_temp.expect_error('select public.create_workspace(''Anonymous'')', '42501', 'anonymous workspace RPC denied');
select pg_temp.expect_error('select public.create_project(current_setting(''test.workspace_a'')::uuid, ''Anonymous'')', '42501', 'anonymous project RPC denied');
reset role;
select pg_temp.assert_true((select count(*) = 5 from pg_class where relnamespace = 'public'::regnamespace and relname in ('workspaces','workspace_members','projects','environments','audit_logs') and relrowsecurity), 'RLS enabled on all tenant tables');
select pg_temp.expect_error('insert into public.workspace_members values (current_setting(''test.workspace_a'')::uuid, ''10000000-0000-0000-0000-000000000003'', ''ROOT'', now())', '23514', 'invalid role constraint');
select pg_temp.expect_error('insert into public.environments(project_id, type) values (current_setting(''test.project_a'')::uuid, ''CUSTOM'')', '23514', 'invalid environment constraint');
select pg_temp.expect_error('insert into public.environments(project_id, type) values (current_setting(''test.project_a'')::uuid, ''STAGING'')', '23505', 'unique project environment constraint');
select pg_temp.expect_error('insert into public.audit_logs(workspace_id, project_id, actor_id, event) values (current_setting(''test.workspace_a'')::uuid, current_setting(''test.project_b'')::uuid, ''10000000-0000-0000-0000-000000000001'', ''PROJECT_CREATED'')', '23503', 'cross-tenant audit reference rejected');
insert into public.workspace_members(workspace_id, user_id, role) values (current_setting('test.workspace_a')::uuid, '10000000-0000-0000-0000-000000000003', 'MEMBER');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select pg_temp.assert_true(public.create_project(current_setting('test.workspace_a')::uuid, 'Member project') is not null, 'MEMBER creates authorized project');
reset role;
update public.workspace_members set role = 'ADMIN' where user_id = '10000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.assert_true(public.create_project(current_setting('test.workspace_a')::uuid, 'Admin project') is not null, 'ADMIN creates authorized project');
reset role;
delete from public.workspace_members where user_id = '10000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.projects), 'revoked membership removes project access');
reset role;
-- Inject a real database failure in environment creation to test transaction atomicity.
create function pg_temp.fail_environment() returns trigger language plpgsql as $$
begin if new.type = 'STAGING' then raise exception 'test-only failure'; end if; return new; end;
$$;
create trigger test_environment_failure before insert on public.environments for each row execute function pg_temp.fail_environment();
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select pg_temp.expect_error('select public.create_project(current_setting(''test.workspace_a'')::uuid, ''Must rollback'')', 'P0001', 'environment failure aborts creation');
select pg_temp.assert_true((select count(*) = 0 from public.projects where name = 'Must rollback'), 'failed project rolled back');
select pg_temp.assert_true((select count(*) = 9 from public.environments), 'no partial environments after failure');
select pg_temp.assert_true((select count(*) = 4 from public.audit_logs), 'no success audit after failure');
reset role;
select count(*) as passed_assertions from pg_temp.test_results;
select label from pg_temp.test_results;
rollback;
