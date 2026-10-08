-- Disposable M1.7 test data; no hosted bootstrap.
\ir fixtures/execution-source.sql
-- M1.7 uses the included disposable source fixture; all changes roll back.
truncate pg_temp.qa_results;
grant all on pg_temp.qa_results to testpilot_runner;
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
select set_config('exec.case',(select id::text from public.test_items where plan_id=current_setting('test.eligible')::uuid and kind='CASE'),true);
select set_config('exec.parent',(select scenario_id::text from public.test_items where id=current_setting('exec.case')::uuid),true);
select public.review_test_item(current_setting('exec.parent')::uuid,null,'APPROVE','',null,null,null);
select public.review_test_item(current_setting('exec.case')::uuid,null,'APPROVE','',null,null,null);
select set_config('exec.environment',(select id::text from public.environments where project_id=current_setting('test.g_pa')::uuid and type='DEVELOPMENT'),true);
select set_config('exec.config',public.configure_execution_environment(current_setting('exec.environment')::uuid,'https://api.example.test/',443,true)::text,true);
select pg_temp.assert_true((select created_by=auth.uid() from public.environment_execution_configs where id=current_setting('exec.config')::uuid),'configuration actor trusted');
select pg_temp.expect_error('select public.configure_execution_environment(current_setting(''exec.environment'')::uuid,''https://user:secret@api.example.test/'',443,true)','23514','userinfo configuration denied');
select pg_temp.expect_error('select public.configure_execution_environment(current_setting(''exec.environment'')::uuid,repeat('' '',2048)||''x'',443,true)','23514','raw target bounded');
select pg_temp.expect_error('select public.request_test_execution(current_setting(''exec.case'')::uuid,(select id from public.environments where project_id=current_setting(''test.g_pa2'')::uuid limit 1))','23514','cross project environment rejected');
select pg_temp.expect_error('select public.request_test_execution(current_setting(''test.case'')::uuid,current_setting(''exec.environment'')::uuid)','23514','unready original case denied');
select set_config('exec.run',public.request_test_execution(current_setting('exec.case')::uuid,current_setting('exec.environment')::uuid)::text,true);
select pg_temp.assert_true((select status='REQUESTED' and decision is null and workspace_id=current_setting('test.g_wa')::uuid and requested_by=auth.uid() from public.execution_runs where id=current_setting('exec.run')::uuid),'planning eligibility does not authorize request');
select pg_temp.expect_error('update public.execution_runs set status=''AUTHORIZED''','42501','browser cannot authorize');
select pg_temp.expect_error('insert into public.execution_results values(current_setting(''exec.run'')::uuid,current_setting(''test.g_wa'')::uuid,''{}'')','42501','browser cannot fake result');
select pg_temp.expect_error('select public.claim_test_execution()','42501','browser cannot claim jobs');
select pg_temp.expect_error('select public.record_execution_safety(current_setting(''exec.run'')::uuid,null,''ALLOW'',''[]'',''{}'',''{}'',repeat(''a'',64))','42501','browser cannot set safety decision');
reset role;
insert into public.workspace_members values(current_setting('test.g_wa')::uuid,'14000000-0000-0000-0000-000000000002','MEMBER',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000002',true);
select pg_temp.expect_error('select public.configure_execution_environment(current_setting(''exec.environment'')::uuid,''https://evil.example.test/'',443,true)','42501','member cannot redirect environment target');
set local role testpilot_runner;
select set_config('exec.job',public.claim_test_execution()::text,true);
select pg_temp.assert_true(current_setting('exec.job')::jsonb->'run'->>'status'='SAFETY_REVIEW','atomic safety claim');
select pg_temp.assert_true(public.claim_test_execution() is null,'duplicate safety claim excluded');
select pg_temp.expect_error('select public.record_execution_safety(current_setting(''exec.run'')::uuid,(current_setting(''exec.job'')::jsonb->''run''->>''claim_token'')::uuid,''ALLOW'',''[]'',''{}'',''{"method":"GET","url":"https://api.example.test/","headers":{"Authorization":"secret"},"body":null,"assertions":[],"operationPointer":"#/info"}'',repeat(''a'',64))','23514','plaintext request Authorization cannot be persisted');
select pg_temp.expect_error('select public.record_execution_safety(current_setting(''exec.run'')::uuid,(current_setting(''exec.job'')::jsonb->''run''->>''claim_token'')::uuid,''ALLOW'',''[]'',''{}'',''{"method":"GET","url":"https://api.example.test/","headers":{},"body":"secret","assertions":[],"operationPointer":"#/info"}'',repeat(''a'',64))','23514','arbitrary body content cannot be persisted');

select pg_temp.expect_error('select public.record_execution_safety(current_setting(''exec.run'')::uuid,(current_setting(''exec.job'')::jsonb->''run''->>''claim_token'')::uuid,''BLOCK'',''["TOKEN_SECRET_ABC"]'',''{}'',null,null)','23514','unknown safety reason cannot substitute for failure');
select pg_temp.expect_error('select public.record_execution_safety(current_setting(''exec.run'')::uuid,(current_setting(''exec.job'')::jsonb->''run''->>''claim_token'')::uuid,''BLOCK'',''["UNSAFE_TARGET"]'',''{"error":"TOKEN_SECRET_ABC"}'',null,null)','23514','raw error fact substitute rejected');
select pg_temp.expect_error('select public.record_execution_safety(current_setting(''exec.run'')::uuid,(current_setting(''exec.job'')::jsonb->''run''->>''claim_token'')::uuid,''BLOCK'',''["UNSAFE_TARGET"]'',''{"addresses":["TOKEN_SECRET_ABC"]}'',null,null)','23514','raw error DNS fact substitute rejected');

select public.record_execution_safety(current_setting('exec.run')::uuid,(current_setting('exec.job')::jsonb->'run'->>'claim_token')::uuid,'BLOCK','["CREDENTIAL_CONFIGURATION_REQUIRED"]','{}',null,null);
select pg_temp.assert_true(public.claim_test_execution() is null,'blocked job cannot be claimed');
set local role authenticated;
select pg_temp.expect_error('select public.decide_execution_approval(current_setting(''exec.run'')::uuid,repeat(''a'',64),true)','42501','member cannot approve execution');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
select pg_temp.expect_error('select public.decide_execution_approval(current_setting(''exec.run'')::uuid,repeat(''a'',64),true)','23514','owner cannot override BLOCK');
select pg_temp.assert_true((select count(*)=0 from public.execution_results),'blocked jobs have no response evidence');
select set_config('exec.approval_run',public.request_test_execution(current_setting('exec.case')::uuid,current_setting('exec.environment')::uuid)::text,true);
set local role testpilot_runner;
select set_config('exec.job',public.claim_test_execution()::text,true);
select public.record_execution_safety(current_setting('exec.approval_run')::uuid,(current_setting('exec.job')::jsonb->'run'->>'claim_token')::uuid,'REQUIRES_APPROVAL','["EXPLICIT_EXECUTION_APPROVAL_REQUIRED"]','{"environment":"DEVELOPMENT","method":"POST"}','{"method":"POST","url":"https://api.example.test/","headers":{},"body":null,"assertions":[],"operationPointer":"#/info"}',repeat('a',64));
select pg_temp.assert_true(public.claim_test_execution() is null,'pending approval cannot execute');
set local role authenticated;
select pg_temp.expect_error('select public.decide_execution_approval(current_setting(''exec.approval_run'')::uuid,repeat(''b'',64),true)','23514','approval fingerprint mismatch rejected');
select public.decide_execution_approval(current_setting('exec.approval_run')::uuid,repeat('a',64),true);
select pg_temp.assert_true((select approved_by=auth.uid() and approved_fingerprint=fingerprint and status='AUTHORIZED' from public.execution_runs where id=current_setting('exec.approval_run')::uuid),'exact owner approval bound');
set local role testpilot_runner;
select set_config('exec.execution_job',public.claim_test_execution()::text,true);
select pg_temp.assert_true(current_setting('exec.execution_job')::jsonb->'run'->>'status'='RUNNING','authorized job transitions once to running');
select pg_temp.assert_true(public.claim_test_execution() is null,'duplicate execution claim excluded');

-- Final boundary sees changes committed before its snapshot, including DNS preparation races.
select pg_temp.assert_true(not public.authorize_execution_send(current_setting('exec.approval_run')::uuid,gen_random_uuid(),repeat('a',64),current_setting('exec.config')::uuid,'1.0.0'),'invalid claim denied at send boundary');
select pg_temp.assert_true(not public.authorize_execution_send(current_setting('exec.approval_run')::uuid,(current_setting('exec.execution_job')::jsonb->'run'->>'claim_token')::uuid,repeat('b',64),current_setting('exec.config')::uuid,'1.0.0'),'stale fingerprint denied at send boundary');
select pg_temp.assert_true(not public.authorize_execution_send(current_setting('exec.approval_run')::uuid,(current_setting('exec.execution_job')::jsonb->'run'->>'claim_token')::uuid,repeat('a',64),gen_random_uuid(),'1.0.0'),'stale configuration denied at send boundary');

reset role;
do $$
declare reason text;ok boolean;
begin
 foreach reason in array array['disable','target','review','cancel','approver'] loop
 begin
 execute 'set local role authenticated';
 if reason='disable' then perform public.configure_execution_environment(current_setting('exec.environment')::uuid,'https://api.example.test/',443,false);
 elsif reason='target' then perform public.configure_execution_environment(current_setting('exec.environment')::uuid,'https://changed.example.test/',443,true);
 elsif reason='review' then perform public.review_test_item(current_setting('exec.case')::uuid,(current_setting('exec.execution_job')::jsonb->'run'->>'case_review_id')::uuid,'REJECT','',null,null,null);
 elsif reason='cancel' then perform public.cancel_test_execution(current_setting('exec.approval_run')::uuid);
 else execute 'reset role';delete from public.workspace_members where workspace_id=current_setting('test.g_wa')::uuid and user_id='14000000-0000-0000-0000-000000000001';end if;
 execute 'set local role testpilot_runner';
 ok:=not public.authorize_execution_send(current_setting('exec.approval_run')::uuid,(current_setting('exec.execution_job')::jsonb->'run'->>'claim_token')::uuid,repeat('a',64),current_setting('exec.config')::uuid,'1.0.0');
 raise exception 'Rollback isolated race mutation' using errcode='P0002';
 exception when no_data_found then null;
 end;
 perform pg_temp.assert_true(ok,'final send rejects '||reason||' race');
 end loop;
end;$$;
set local role testpilot_runner;
select pg_temp.assert_true(public.authorize_execution_send(current_setting('exec.approval_run')::uuid,(current_setting('exec.execution_job')::jsonb->'run'->>'claim_token')::uuid,repeat('a',64),current_setting('exec.config')::uuid,'1.0.0'),'exact current final send authorized');
select pg_temp.assert_true(not public.authorize_execution_send(current_setting('exec.approval_run')::uuid,(current_setting('exec.execution_job')::jsonb->'run'->>'claim_token')::uuid,repeat('a',64),current_setting('exec.config')::uuid,'1.0.0'),'send authorization cannot be reused');

select pg_temp.expect_error('select public.finish_test_execution(current_setting(''exec.approval_run'')::uuid,gen_random_uuid(),''{"outcome":"PASSED","sent":true,"response":null,"assertions":[],"failure":null}'')','23514','claim token cannot be substituted');
select pg_temp.expect_error('select public.finish_test_execution(current_setting(''exec.approval_run'')::uuid,(current_setting(''exec.execution_job'')::jsonb->''run''->>''claim_token'')::uuid,''{"outcome":"PASSED","sent":false,"response":{},"assertions":[],"failure":null}'')','23514','no observed response without sent request');
select pg_temp.expect_error('select public.finish_test_execution(current_setting(''exec.approval_run'')::uuid,(current_setting(''exec.execution_job'')::jsonb->''run''->>''claim_token'')::uuid,''{"outcome":"PASSED","sent":true,"response":{"headers":{"Set-Cookie":"secret"},"body":null},"assertions":[],"failure":null}'')','23514','plaintext response cookie cannot be persisted');
select pg_temp.expect_error('select public.finish_test_execution(current_setting(''exec.approval_run'')::uuid,(current_setting(''exec.execution_job'')::jsonb->''run''->>''claim_token'')::uuid,''{"outcome":"PASSED","sent":true,"response":null,"assertions":[],"failure":null,"authorization":"secret"}'')','23514','unrecognized secret result fields rejected');

reset role;
do $$
declare bad jsonb;clean jsonb:=jsonb_build_object('outcome','PASSED','sent',true,'failure',null,'response',jsonb_build_object('status',200,'headers',jsonb_build_object('content-type','application/json'),'body','{"field_0":1}','bodyHandling','JSON','contentType','application/json','bytes',12,'durationMs',1,'observedAt','2026-10-07T00:00:00.000Z'),'assertions',jsonb_build_array(jsonb_build_object('kind','STATUS_IN_DECLARED_SET','expected',jsonb_build_array(200),'pointer','#/info','status','PASS','actual','200','reason','Compared observed response with declared assertion.')));label text;pair record;
begin
 for pair in select * from (values
 ('passed without send',jsonb_set(clean,'{sent}','false')),
 ('passed without response',jsonb_set(clean,'{response}','null')),
 ('passed without assertions',jsonb_set(clean,'{assertions}','[]')),
 ('passed not evaluated',jsonb_set(clean,'{assertions,0,status}','"NOT_EVALUATED"')),
 ('failed without fail',jsonb_set(clean,'{outcome}','"FAILED"')),
 ('blocked fabricated response',jsonb_set(clean,'{outcome}','"BLOCKED"')),
 ('error fabricated success response',jsonb_set(clean,'{outcome}','"ERROR"')),
 ('cancelled fabricated response',jsonb_set(clean,'{outcome}','"CANCELLED"')),
 ('unsafe header value',jsonb_set(clean,'{response,headers,cache-control}','"token=fixture-sensitive-marker"')),
 ('unsafe content type',jsonb_set(clean,'{response,contentType}','"application/json; token=fixture-sensitive-marker"')),
 ('unsafe property name',jsonb_set(clean,'{response,body}',to_jsonb('{"fixture-sensitive-marker":1}'::text))),
 ('unsafe nested key',jsonb_set(clean,'{response,body}',to_jsonb('{"field_0":[{"fixture-sensitive-marker":1}]}'::text))),
 ('unsafe body value',jsonb_set(clean,'{response,body}',to_jsonb('{"field_0":"fixture-sensitive-marker"}'::text))),
 ('unsafe assertion expected',jsonb_set(clean,'{assertions,0,expected}','["fixture-sensitive-marker"]')),
 ('unsafe assertion actual',jsonb_set(clean,'{assertions,0,actual}','"fixture-sensitive-marker"')),
 ('unsafe nested extra field',jsonb_set(clean,'{response,token}','"fixture-sensitive-marker"'))
 ) as cases(label,payload) loop
 execute 'set local role testpilot_runner';
 perform pg_temp.expect_error(format('select public.finish_test_execution(%L::uuid,%L::uuid,%L::jsonb)',current_setting('exec.approval_run'),current_setting('exec.execution_job')::jsonb->'run'->>'claim_token',pair.payload::text),'23514',pair.label);
 execute 'reset role';
 end loop;
 perform pg_temp.assert_true(public.execution_result_safe(clean),'sanitized passed representation valid');
 perform pg_temp.assert_true(public.execution_result_safe(jsonb_set(jsonb_set(clean,'{outcome}','"FAILED"'),'{assertions,0,status}','"FAIL"')),'evaluated failed representation valid');
 perform pg_temp.assert_true(public.execution_result_safe('{"outcome":"BLOCKED","sent":false,"response":null,"assertions":[],"failure":"BLOCK_AUTHORIZATION_STALE"}'),'blocked representation honest');
 perform pg_temp.assert_true(public.execution_result_safe('{"outcome":"CANCELLED","sent":true,"response":null,"assertions":[],"failure":"CANCELLED"}'),'after-send cancellation representation honest');
end;$$;
set local role testpilot_runner;


reset role;
do $$
declare code text;o text;ok boolean;payload jsonb;
begin
 foreach code in array array['BEARER_FIXTURE_CREDENTIAL_123','TOKEN_SECRET_ABC','PASSWORD_VALUE_123','UNKNOWN_FAILURE','ARBITRARY_UPPERCASE','raw lowercase exception text',repeat('A',201)] loop
 execute 'set local role testpilot_runner';
 payload:=jsonb_build_object('outcome','ERROR','sent',false,'response',null,'assertions','[]'::jsonb,'failure',code);
 perform pg_temp.expect_error(format('select public.finish_test_execution(%L::uuid,%L::uuid,%L::jsonb)',current_setting('exec.approval_run'),current_setting('exec.execution_job')::jsonb->'run'->>'claim_token',payload::text),'23514','unsafe failure rejected '||left(code,40));
 execute 'reset role';end loop;
 foreach code in array array['CANCELLED','TIMEOUT','BLOCK_REQUEST_NOT_RUNNABLE','SAFETY_BLOCKED','BLOCK_AUTHORIZATION_STALE','REQUEST_FINGERPRINT_CHANGED','TRANSPORT_FAILURE','RESPONSE_CAPTURE_FAILURE','RESPONSE_TOO_LARGE','REDIRECT_DISABLED','CONNECTION_TIMEOUT'] loop
 o:=case when code='CANCELLED' then 'CANCELLED' when code in ('BLOCK_REQUEST_NOT_RUNNABLE','SAFETY_BLOCKED','BLOCK_AUTHORIZATION_STALE','REQUEST_FINGERPRINT_CHANGED') then 'BLOCKED' else 'ERROR' end;
 payload:=jsonb_build_object('outcome',o,'sent',false,'response',null,'assertions','[]'::jsonb,'failure',code);ok:=false;
 begin
 execute 'set local role testpilot_runner';perform public.finish_test_execution(current_setting('exec.approval_run')::uuid,(current_setting('exec.execution_job')::jsonb->'run'->>'claim_token')::uuid,payload);ok:=true;
 raise exception 'Rollback successful isolated failure result' using errcode='P0002';exception when no_data_found then null;end;
 perform pg_temp.assert_true(ok,'known failure accepted through RPC '||code);
 end loop;
end;$$;
set local role testpilot_runner;

select public.finish_test_execution(current_setting('exec.approval_run')::uuid,(current_setting('exec.execution_job')::jsonb->'run'->>'claim_token')::uuid,'{"outcome":"ERROR","sent":false,"response":null,"assertions":[],"failure":"TRANSPORT_FAILURE"}');
select pg_temp.expect_error('select public.finish_test_execution(current_setting(''exec.approval_run'')::uuid,(current_setting(''exec.execution_job'')::jsonb->''run''->>''claim_token'')::uuid,''{"outcome":"ERROR","sent":false,"response":null,"assertions":[],"failure":"TIMEOUT"}'')','23514','result immutable and changed duplicate completion denied');
set local role authenticated;
select set_config('exec.stale',public.request_test_execution(current_setting('exec.case')::uuid,current_setting('exec.environment')::uuid)::text,true);
set local role testpilot_runner;
select set_config('exec.job',public.claim_test_execution()::text,true);
select public.record_execution_safety(current_setting('exec.stale')::uuid,(current_setting('exec.job')::jsonb->'run'->>'claim_token')::uuid,'REQUIRES_APPROVAL','[]','{}','{"method":"POST","url":"https://api.example.test/","headers":{},"body":null,"assertions":[],"operationPointer":"#/info"}',repeat('a',64));
set local role authenticated;
select public.configure_execution_environment(current_setting('exec.environment')::uuid,'https://changed.example.test/',443,true);
select pg_temp.expect_error('select public.decide_execution_approval(current_setting(''exec.stale'')::uuid,repeat(''a'',64),true)','23514','changed target invalidates approval');
select set_config('exec.revoked',public.request_test_execution(current_setting('exec.case')::uuid,current_setting('exec.environment')::uuid)::text,true);
set local role testpilot_runner;
select set_config('exec.job',public.claim_test_execution()::text,true);
select public.record_execution_safety(current_setting('exec.revoked')::uuid,(current_setting('exec.job')::jsonb->'run'->>'claim_token')::uuid,'REQUIRES_APPROVAL','[]','{}','{"method":"POST","url":"https://changed.example.test/","headers":{},"body":null,"assertions":[],"operationPointer":"#/info"}',repeat('a',64));
set local role authenticated;
select public.decide_execution_approval(current_setting('exec.revoked')::uuid,repeat('a',64),true);
select public.configure_execution_environment(current_setting('exec.environment')::uuid,'https://changed-again.example.test/',443,true);
set local role testpilot_runner;
select pg_temp.assert_true(public.claim_test_execution() is null,'target changed after approval cannot be executed');
set local role authenticated;
select pg_temp.assert_true((select status='BLOCKED' and decision='BLOCK' from public.execution_runs where id=current_setting('exec.revoked')::uuid),'stale approved job transitions to BLOCK without override');
select set_config('exec.cancel',public.request_test_execution(current_setting('exec.case')::uuid,current_setting('exec.environment')::uuid)::text,true);
select public.cancel_test_execution(current_setting('exec.cancel')::uuid);
select pg_temp.assert_true((select status='CANCELLED' and cancel_requested from public.execution_runs where id=current_setting('exec.cancel')::uuid),'queued cancellation has honest lifecycle');
reset role;
delete from public.workspace_members where workspace_id=current_setting('test.g_wa')::uuid and user_id='14000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.execution_runs),'tenant run RLS');
select pg_temp.assert_true((select count(*)=0 from public.execution_results),'tenant result RLS');
select pg_temp.assert_true((select count(*)=0 from public.environment_execution_configs),'tenant configuration RLS');
select pg_temp.assert_true((select count(*)=0 from public.execution_audit_events),'tenant audit RLS');
select pg_temp.expect_error('select public.request_test_execution(current_setting(''exec.case'')::uuid,current_setting(''exec.environment'')::uuid)','42501','cross tenant request denied');
reset role;
select pg_temp.assert_true((select count(*)>0 from public.execution_audit_events where system_actor and actor_id is null),'system audit distinct from user');
select pg_temp.assert_true((select count(*)=1 from public.execution_results where workspace_id=current_setting('test.g_wa')::uuid),'only known execution result persisted');
select pg_temp.assert_true((select bool_and(relrowsecurity) from pg_class where oid in ('public.execution_runs'::regclass,'public.execution_results'::regclass,'public.environment_execution_configs'::regclass,'public.execution_audit_events'::regclass)),'all execution tables independently RLS protected');
select pg_temp.assert_true(not has_table_privilege('testpilot_runner','public.execution_runs','UPDATE'),'runner lacks direct table mutation');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.execution_worker_context(public.execution_runs)','EXECUTE'),'private context inaccessible');

select pg_temp.assert_true(public.execution_literal_safe('https://api.example.test/auth/token'),'semantic token endpoint SQL allowed');
select pg_temp.assert_true(not public.execution_literal_safe('https://api.example.test/token/fixture-sensitive-marker'),'credential literal path SQL denied');
select pg_temp.assert_true(not public.execution_literal_safe('https://api.example.test/access_token%3Dfixture-sensitive-marker'),'encoded credential literal SQL denied');
select pg_temp.expect_error('update public.execution_runs set case_review_id=scenario_review_id where id=current_setting(''exec.approval_run'')::uuid','23503','review cannot reference another item');
select pg_temp.expect_error('alter role testpilot_runner superuser;select public.validate_execution_runner_role()','42501','runner superuser denied');
select pg_temp.expect_error('alter role testpilot_runner createdb;select public.validate_execution_runner_role()','42501','runner createdb denied');
select pg_temp.expect_error('alter role testpilot_runner createrole;select public.validate_execution_runner_role()','42501','runner createrole denied');
select pg_temp.expect_error('alter role testpilot_runner replication;select public.validate_execution_runner_role()','42501','runner replication denied');
select pg_temp.expect_error('alter role testpilot_runner bypassrls;select public.validate_execution_runner_role()','42501','runner bypassrls denied');
select pg_temp.expect_error('grant authenticated to testpilot_runner;select public.validate_execution_runner_role()','42501','runner inherited membership denied');
select pg_temp.expect_error('grant update on public.execution_runs to testpilot_runner;select public.validate_execution_runner_role()','42501','runner direct table authority denied');


do $$
declare saved_run_id uuid;job jsonb;clean jsonb:=jsonb_build_object('outcome','PASSED','sent',true,'failure',null,'response',jsonb_build_object('status',200,'headers',jsonb_build_object('content-type','application/json','set-cookie','[REDACTED]'),'body','{"field_0":[{"field_0":"[REDACTED]"}],"field_1":1}','bodyHandling','JSON','contentType','application/json','bytes',72,'durationMs',1,'observedAt','2026-10-07T00:00:00.000Z'),'assertions',jsonb_build_array(jsonb_build_object('kind','STATUS_IN_DECLARED_SET','expected',jsonb_build_array(200),'pointer','#/info','status','PASS','actual','200','reason','Compared observed response with declared assertion.')));
begin
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
 saved_run_id:=public.request_test_execution(current_setting('exec.case')::uuid,current_setting('exec.environment')::uuid);
 execute 'set local role testpilot_runner';job:=public.claim_test_execution();
 perform public.record_execution_safety(saved_run_id,(job->'run'->>'claim_token')::uuid,'ALLOW','[]','{}',jsonb_build_object('method','GET','url','https://changed-again.example.test/status','headers','{}'::jsonb,'body',null,'assertions',jsonb_build_array((clean->'assertions'->0)-array['status','actual','reason']),'operationPointer','#/info'),repeat('c',64));
 job:=public.claim_test_execution();
 perform pg_temp.assert_true(public.authorize_execution_send(saved_run_id,(job->'run'->>'claim_token')::uuid,repeat('c',64),(job->'run'->>'config_id')::uuid,'1.0.0'),'positive persistence send authorized');

 perform pg_temp.expect_error(format('select public.finish_test_execution(%L::uuid,%L::uuid,%L::jsonb)',saved_run_id,job->'run'->>'claim_token',jsonb_set(clean,'{assertions,0,expected}','[201]')::text),'23514','assertion expectation substitution denied');
 perform pg_temp.expect_error(format('select public.finish_test_execution(%L::uuid,%L::uuid,%L::jsonb)',saved_run_id,job->'run'->>'claim_token',jsonb_set(clean,'{response,status}','500')::text),'23514','fabricated passing assertion against observation denied');
 perform public.finish_test_execution(saved_run_id,(job->'run'->>'claim_token')::uuid,clean);
 execute 'reset role';
 perform pg_temp.assert_true((select result=clean from public.execution_results where execution_results.run_id=saved_run_id),'sanitized result actually persisted');
 perform pg_temp.assert_true((select result::text not like '%fixture-sensitive-marker%' from public.execution_results where execution_results.run_id=saved_run_id),'persisted result/UI serialization has no sensitive marker');
end;$$;


select public.validate_execution_runner_role();
select pg_temp.assert_true((select count(*)=5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and exists(select 1 from aclexplode(p.proacl) a where a.grantee=(select oid from pg_roles where rolname='testpilot_runner') and a.privilege_type='EXECUTE')),'only five exact runner routine grants');
select pg_temp.expect_error($probe$create function public.claim_test_execution(text) returns integer language sql as 'select 1';revoke all on function public.claim_test_execution(text) from public;grant execute on function public.claim_test_execution(text) to testpilot_runner;select public.validate_execution_runner_role()$probe$,'42501','runner overload rejected');
select pg_temp.expect_error($probe$create function public.claim_test_execution(integer) returns integer language sql as 'select 1';revoke all on function public.claim_test_execution(integer) from public;grant execute on function public.claim_test_execution(integer) to testpilot_runner;select public.validate_execution_runner_role()$probe$,'42501','runner different argument signature rejected');
select pg_temp.expect_error($probe$create schema runner_authority_fixture;create function runner_authority_fixture.claim_test_execution() returns integer language sql as 'select 1';revoke all on function runner_authority_fixture.claim_test_execution() from public;grant execute on function runner_authority_fixture.claim_test_execution() to testpilot_runner;select public.validate_execution_runner_role()$probe$,'42501','runner unexpected schema rejected');
select pg_temp.expect_error($probe$create function public.execution_extra_authority() returns integer language sql as 'select 1';revoke all on function public.execution_extra_authority() from public;grant execute on function public.execution_extra_authority() to testpilot_runner;select public.validate_execution_runner_role()$probe$,'42501','runner extra routine authority rejected');
select pg_temp.assert_true((select bool_and(to_jsonb(e)::text not like '%BEARER_FIXTURE_CREDENTIAL_123%' and to_jsonb(e)::text not like '%TOKEN_SECRET_ABC%') from public.execution_audit_events e where workspace_id=current_setting('test.g_wa')::uuid),'audit contains only safe transition data');

select pg_temp.expect_error($probe$create function public.claim_test_execution(text default '') returns integer language sql as 'select 1';select public.validate_execution_runner_role()$probe$,'42501','default PUBLIC overload authority rejected');
-- Actual SQL predicate receives PG17-shaped catalog rows; PG15 cannot create
-- per-membership INHERIT/SET options. These are compatibility fixtures, not
-- claims that PG17 CREATE ROLE ran locally.
do $$
declare runner oid:=(select oid from pg_roles where rolname='testpilot_runner');creator oid:=(select oid from pg_roles where rolname='postgres');authenticator_id oid;creator_row jsonb;authenticator_row jsonb;
begin
 if not exists(select 1 from pg_roles where rolname='authenticator') then create role authenticator nologin noinherit;end if;
 select oid into authenticator_id from pg_roles where rolname='authenticator';
 creator_row:=jsonb_build_object('roleid',runner,'member',creator,'grantor',10,'admin_option',true,'inherit_option',false,'set_option',false);
 authenticator_row:=jsonb_build_object('roleid',runner,'member',authenticator_id,'grantor',creator,'admin_option',false,'inherit_option',false,'set_option',true);
 perform pg_temp.assert_true(public.execution_runner_membership_safe(creator_row,runner),'PG17 exact creator ADMIN-only accepted');
 perform pg_temp.assert_true(not public.execution_runner_membership_safe(jsonb_set(creator_row,'{inherit_option}','true'),runner),'PG17 creator INHERIT rejected');
 perform pg_temp.assert_true(not public.execution_runner_membership_safe(jsonb_set(creator_row,'{set_option}','true'),runner),'PG17 creator SET rejected');
 perform pg_temp.assert_true(not public.execution_runner_membership_safe(jsonb_set(creator_row,'{member}',to_jsonb(authenticator_id)),runner),'PG17 unexpected ADMIN-only member rejected');
 perform pg_temp.assert_true(not public.execution_runner_membership_safe(jsonb_set(creator_row,'{grantor}',to_jsonb(authenticator_id)),runner),'PG17 unexpected creator grantor rejected');
 perform pg_temp.assert_true(not public.execution_runner_membership_safe(jsonb_set(creator_row,'{admin_option}','false'),runner),'PG17 creator without ADMIN rejected');
 perform pg_temp.assert_true(not public.execution_runner_membership_safe(creator_row-'set_option',runner),'PG17 missing creator option rejected');
 perform pg_temp.assert_true(not public.execution_runner_membership_safe(jsonb_set(creator_row,'{roleid}',to_jsonb(creator)),runner),'PG17 reversed privileged role grant rejected');
 perform pg_temp.assert_true(public.execution_runner_membership_safe(authenticator_row,runner),'PG17 exact authenticator options accepted');
 perform pg_temp.assert_true(public.execution_runner_membership_safe(jsonb_set(authenticator_row,'{grantor}','10'),runner),'PG17 bootstrap authenticator grantor accepted');
 perform pg_temp.assert_true(not public.execution_runner_membership_safe(jsonb_set(authenticator_row,'{admin_option}','true'),runner),'PG17 authenticator ADMIN rejected');
 perform pg_temp.assert_true(not public.execution_runner_membership_safe(jsonb_set(authenticator_row,'{inherit_option}','true'),runner),'PG17 authenticator INHERIT rejected');
 perform pg_temp.assert_true(not public.execution_runner_membership_safe(jsonb_set(authenticator_row,'{set_option}','false'),runner),'PG17 authenticator missing SET rejected');
 perform pg_temp.assert_true(not public.execution_runner_membership_safe(jsonb_set(authenticator_row,'{grantor}',to_jsonb(authenticator_id)),runner),'PG17 unexpected authenticator grantor rejected');
 if current_setting('server_version_num')::integer>=160000 then
  execute 'grant testpilot_runner to authenticator with admin false, inherit false, set true';
 else grant testpilot_runner to authenticator;end if;
 perform public.validate_execution_runner_role();
 perform pg_temp.assert_true(true,'real exact authenticator membership accepted by validator');
 perform pg_temp.expect_error('grant testpilot_runner to authenticated with admin option;select public.validate_execution_runner_role()','42501','real unexpected ADMIN member rejected');
 perform pg_temp.expect_error('grant authenticated to anon;grant anon to testpilot_runner;select public.validate_execution_runner_role()','42501','real transitive privileged membership rejected');
end;$$;

-- Real extension catalog/ACL regression, never hosted provisioning.
select pg_temp.assert_true(public.execution_runner_platform_view_safe('extensions.pg_stat_statements'::regclass,(select oid from pg_roles where rolname='testpilot_runner')),'exact extension stats view accepted');
select pg_temp.assert_true(public.execution_runner_platform_view_safe('extensions.pg_stat_statements_info'::regclass,(select oid from pg_roles where rolname='testpilot_runner')),'exact extension info view accepted');
select public.validate_execution_runner_role();
select pg_temp.assert_true(true,'real PUBLIC extension baseline and database baseline accepted');
select pg_temp.expect_error('alter extension pg_stat_statements drop view extensions.pg_stat_statements;select public.validate_execution_runner_role()','42501','fake similarly named non-extension view rejected');
select pg_temp.expect_error('create view extensions.other_stats as select 1 as value;alter extension pg_stat_statements add view extensions.other_stats;grant select on extensions.other_stats to public;select public.validate_execution_runner_role()','42501','arbitrary extension view rejected');
select pg_temp.expect_error('grant update on extensions.pg_stat_statements to public;select public.validate_execution_runner_role()','42501','extension PUBLIC mutation rejected');
select pg_temp.expect_error('grant select on extensions.pg_stat_statements to testpilot_runner;select public.validate_execution_runner_role()','42501','explicit extension runner SELECT rejected');
select pg_temp.expect_error('grant select on public.execution_runs to public;select public.validate_execution_runner_role()','42501','application PUBLIC SELECT rejected');
select pg_temp.expect_error('grant select on public.execution_runs to testpilot_runner;select public.validate_execution_runner_role()','42501','application direct SELECT rejected');
select pg_temp.expect_error('alter table public.execution_results owner to testpilot_runner;select public.validate_execution_runner_role()','42501','runner application ownership rejected');
select pg_temp.expect_error('grant select(status) on public.execution_runs to testpilot_runner;select public.validate_execution_runner_role()','42501','runner column SELECT rejected');
select pg_temp.expect_error('grant update(status) on public.execution_runs to testpilot_runner;select public.validate_execution_runner_role()','42501','runner column UPDATE rejected');
select pg_temp.expect_error('grant select(status) on public.execution_runs to public;select public.validate_execution_runner_role()','42501','PUBLIC column SELECT rejected');
select pg_temp.expect_error('grant select(userid) on extensions.pg_stat_statements to public;select public.validate_execution_runner_role()','42501','extension column grant rejected');
select pg_temp.expect_error('create sequence public.runner_sequence_fixture;grant usage on sequence public.runner_sequence_fixture to testpilot_runner;select public.validate_execution_runner_role()','42501','runner sequence USAGE rejected');
select pg_temp.expect_error('create sequence public.runner_sequence_fixture;grant update on sequence public.runner_sequence_fixture to testpilot_runner;select public.validate_execution_runner_role()','42501','runner sequence UPDATE rejected');
select pg_temp.expect_error('create sequence public.runner_sequence_fixture;grant usage on sequence public.runner_sequence_fixture to public;select public.validate_execution_runner_role()','42501','PUBLIC sequence USAGE rejected');
select pg_temp.expect_error('grant create on schema public to testpilot_runner;select public.validate_execution_runner_role()','42501','runner schema CREATE rejected');
select pg_temp.expect_error('grant usage on schema extensions to testpilot_runner;select public.validate_execution_runner_role()','42501','unexpected extensions USAGE rejected');
select pg_temp.expect_error(format('grant create on database %I to testpilot_runner;select public.validate_execution_runner_role()',current_database()),'42501','runner database CREATE rejected');
select pg_temp.expect_error('alter role testpilot_runner login;select public.validate_execution_runner_role()','42501','runner LOGIN rejected');
select pg_temp.expect_error('alter role testpilot_runner inherit;select public.validate_execution_runner_role()','42501','runner INHERIT rejected');
do $$ begin
 if current_setting('server_version_num')::integer>=170000 then
  perform pg_temp.expect_error('grant maintain on public.execution_runs to testpilot_runner;select public.validate_execution_runner_role()','42501','PG17 runner MAINTAIN rejected');
  perform pg_temp.expect_error('grant maintain on extensions.pg_stat_statements to public;select public.validate_execution_runner_role()','42501','PG17 PUBLIC extension MAINTAIN rejected');
 else raise notice 'PG17 MAINTAIN grant regressions deferred: local PostgreSQL does not support MAINTAIN';end if;
end;$$;
select pg_temp.expect_error('grant select on pg_catalog.pg_class to testpilot_runner;select public.validate_execution_runner_role()','42501','explicit system relation grant rejected despite PUBLIC baseline');
select pg_temp.expect_error('grant execute on function pg_catalog.version() to testpilot_runner;select public.validate_execution_runner_role()','42501','explicit system routine grant rejected despite PUBLIC baseline');
select pg_temp.expect_error('create sequence public.runner_sequence_fixture;grant select on sequence public.runner_sequence_fixture to public;select public.validate_execution_runner_role()','42501','PUBLIC sequence SELECT rejected');
-- This suite is seeded with service_role function defaults before migrations.
select pg_temp.assert_true((select count(*)=5 and bool_and(not has_function_privilege('service_role',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE')) from pg_proc p cross join lateral aclexplode(p.proacl) a where a.grantee=(select oid from pg_roles where rolname='testpilot_runner') and a.privilege_type='EXECUTE'),'five runner RPCs remove service/anon/authenticated defaults');
select pg_temp.assert_true((select count(*)=11 and bool_and(not has_function_privilege('service_role',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('testpilot_runner',p.oid,'EXECUTE')) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('execution_runner_platform_view_safe','execution_runner_membership_safe','validate_execution_runner_role','execution_literal_safe','execution_planning_ready','execution_binding_current','execution_worker_context','execution_body_safe','execution_request_assertions_safe','execution_capture_json_safe','execution_result_safe')),'private helpers remove all external role defaults');
select pg_temp.assert_true((select count(*)=4 and bool_and(has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('testpilot_runner',p.oid,'EXECUTE')) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('configure_execution_environment','request_test_execution','decide_execution_approval','cancel_test_execution')),'user RPC deliberate authenticated-only access');

select count(*) as m17_assertions_passed from pg_temp.qa_results;
rollback;
