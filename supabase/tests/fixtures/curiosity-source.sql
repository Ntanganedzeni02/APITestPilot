-- Disposable local fixtures: actual SQL RPCs, no HTTP or hosted writes.
\ir execution-source.sql
truncate pg_temp.qa_results;
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
select set_config('exec.case',(select id::text from public.test_items where plan_id=current_setting('test.eligible')::uuid and kind='CASE'),true);
select set_config('exec.parent',(select scenario_id::text from public.test_items where id=current_setting('exec.case')::uuid),true);
select public.review_test_item(current_setting('exec.parent')::uuid,null,'APPROVE','',null,null,null);
select public.review_test_item(current_setting('exec.case')::uuid,null,'APPROVE','',null,null,null);
select set_config('exec.environment',(select id::text from public.environments where project_id=current_setting('test.g_pa')::uuid and type='DEVELOPMENT'),true);
select set_config('exec.config',public.configure_execution_environment(current_setting('exec.environment')::uuid,'https://api.example.test/',443,true)::text,true);
reset role;
create function pg_temp.evidence_run(outcome text,failure text default null,expected_status integer default 200) returns uuid language plpgsql as $$
declare run_id uuid;job jsonb;payload jsonb;status_code integer:=case when outcome='FAILED' then 500 else 200 end;
begin
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
 run_id:=public.request_test_execution(current_setting('exec.case')::uuid,current_setting('exec.environment')::uuid);
 execute 'set local role testpilot_runner';job:=public.claim_test_execution();
 perform public.record_execution_safety(run_id,(job->'run'->>'claim_token')::uuid,'ALLOW','[]','{}',jsonb_set('{"method":"GET","url":"https://api.example.test/","headers":{},"body":null,"assertions":[{"kind":"STATUS_IN_DECLARED_SET","expected":[200],"pointer":"#/info"}],"operationPointer":"#/info"}', '{assertions,0,expected}',jsonb_build_array(expected_status)),repeat('c',64));
 job:=public.claim_test_execution();
 perform public.authorize_execution_send(run_id,(job->'run'->>'claim_token')::uuid,repeat('c',64),(job->'run'->>'config_id')::uuid,'1.0.0');
 payload:=jsonb_build_object('outcome',outcome,'sent',outcome in ('FAILED','PASSED'),'failure',failure,'response',case when outcome in ('FAILED','PASSED') then jsonb_build_object('status',status_code,'headers',jsonb_build_object('set-cookie','[REDACTED]','content-type','application/json'),'body','{"field_0":"[REDACTED]"}','bodyHandling','JSON','contentType','application/json','bytes',26,'durationMs',10,'observedAt','2026-10-07T00:00:00.000Z') end,'assertions',case when outcome in ('FAILED','PASSED') then jsonb_build_array(jsonb_build_object('kind','STATUS_IN_DECLARED_SET','expected',jsonb_build_array(expected_status),'pointer','#/info','status',case when outcome='FAILED' then 'FAIL' else 'PASS' end,'actual',status_code::text,'reason','Compared observed response with declared assertion.')) else '[]'::jsonb end);
 perform public.finish_test_execution(run_id,(job->'run'->>'claim_token')::uuid,payload);
 execute 'reset role';return run_id;
end;$$;

update public.api_imports set knowledge=jsonb_set(knowledge,'{operations}','[{"key":"GET /users","method":"get","path":"/users","sourcePointer":"#/info","parameters":[{"name":"status","location":"query","required":true,"sourcePointer":"#/info","schema":{"type":"integer"}}],"responses":[{"status":"200","sourcePointer":"#/info","content":{}}],"security":[]}]') where id=current_setting('test.g_import')::uuid;
update public.test_items set definition=jsonb_set(definition,'{nodeRefs}','["[\"OPERATION\",\"GET /users\"]"]') where id=current_setting('exec.case')::uuid;
insert into public.test_item_nodes(item_id,plan_id,qa_analysis_id,workspace_id,behaviour_graph_id,api_import_id,project_id,node_id)
 select c.id,p.id,p.qa_analysis_id,p.workspace_id,p.behaviour_graph_id,p.api_import_id,p.project_id,'["OPERATION","GET /users"]' from public.test_items c join public.test_plans p on p.id=c.plan_id where c.id=current_setting('exec.case')::uuid;
select set_config('ev.run',pg_temp.evidence_run('FAILED')::text,true);
