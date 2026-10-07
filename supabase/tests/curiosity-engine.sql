-- Disposable local fixtures only; real persistence RPCs, no network.
\ir fixtures/curiosity-source.sql
truncate pg_temp.qa_results;
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
select set_config('cu.i',public.derive_investigation(current_setting('ev.run')::uuid)::text,true);
select pg_temp.assert_true(public.derive_investigation(current_setting('ev.run')::uuid)=current_setting('cu.i')::uuid,'idempotent investigation');
select pg_temp.assert_true((select trigger='FAILED_ASSERTION' from public.investigations),'persisted trigger');
select pg_temp.assert_true((select count(*)=1 from public.investigations),'one investigation');
select pg_temp.assert_true(public.investigation_context(current_setting('cu.i')::uuid)->'observedValues'->0->>'field'='response.status','only eligible status provenance');
select pg_temp.assert_true(jsonb_array_length(public.investigation_context(current_setting('cu.i')::uuid)->'cases')=1,'grounded case');
create function pg_temp.curiosity_payload() returns jsonb language sql as $$
 select jsonb_build_object('caseId',current_setting('exec.case'),'hypothesis','Repeat the selected case to assess its declared assertions.','rationale','Compare persisted assertion evidence.','confidence','LOW','evidenceItemIds',jsonb_build_array((select id from public.evidence_items where package_id=(select source_package_id from public.investigations where id=current_setting('cu.i')::uuid) order by id limit 1)),'dependencyId',null,'bindings','[]'::jsonb);
$$;

-- Secret-bearing imported literal paths must not enter curiosity context/persistence.
reset role;
update public.api_imports set knowledge=jsonb_set(knowledge,'{operations,0,path}','"/password/fixture-secret"') where id=current_setting('test.g_import')::uuid;
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.investigation_context(current_setting('cu.i')::uuid)->'cases')=0,'unsafe imported operation path excluded');
select pg_temp.expect_error('select public.persist_investigation_proposal(current_setting(''cu.i'')::uuid,pg_temp.curiosity_payload())','23514','unsafe operation cannot create proposal');
reset role;
update public.api_imports set knowledge=jsonb_set(knowledge,'{operations,0,path}','"/users"') where id=current_setting('test.g_import')::uuid;
set local role authenticated;
select set_config('cu.p',public.persist_investigation_proposal(current_setting('cu.i')::uuid,pg_temp.curiosity_payload())::text,true);
select set_config('cu.fp',(select fingerprint from public.investigation_proposals where id=current_setting('cu.p')::uuid),true);
select pg_temp.assert_true(public.persist_investigation_proposal(current_setting('cu.i')::uuid,pg_temp.curiosity_payload())=current_setting('cu.p')::uuid,'idempotent proposal');
select pg_temp.assert_true(public.persist_investigation_proposal(current_setting('cu.i')::uuid,jsonb_set(pg_temp.curiosity_payload(),'{rationale}','"Different prose."'))=current_setting('cu.p')::uuid,'equivalent proposal');
select pg_temp.assert_true((select count(*)=1 from public.investigation_citations),'citation normalized');
select pg_temp.expect_error('select public.materialize_investigation_proposal(current_setting(''cu.p'')::uuid,current_setting(''cu.fp''))','23514','unapproved blocked');
do $$ declare field text;payload jsonb;
begin
 foreach field in array array['url','hostname','headers','authorization','shell','javascript','sql','budget','chainOfThought','operationId','graphNodeId'] loop
 payload:=pg_temp.curiosity_payload()||jsonb_build_object(field,'fixture');
 perform pg_temp.expect_error(format('select public.persist_investigation_proposal(%L,%L)',current_setting('cu.i'),payload),'23514','unknown authority field '||field);end loop;
 foreach field in array array['Authorization: Bearer fixture_value','token=fixture_value','password=fixture_value','cookie=fixture_value','sb_secret_fixture','https://fixture:fixture@example.invalid','https://example.invalid'] loop
 payload:=jsonb_set(pg_temp.curiosity_payload(),'{rationale}',to_jsonb(field));
 perform pg_temp.expect_error(format('select public.persist_investigation_proposal(%L,%L)',current_setting('cu.i'),payload),'23514','unsafe text '||md5(field));end loop;
end;$$;
select pg_temp.expect_error('select public.persist_investigation_proposal(current_setting(''cu.i'')::uuid,jsonb_set(pg_temp.curiosity_payload(),''{hypothesis}'',''"Defect proven."''))','23514','unsupported hypothesis');
select pg_temp.expect_error('select public.persist_investigation_proposal(current_setting(''cu.i'')::uuid,jsonb_set(pg_temp.curiosity_payload(),''{bindings}'',''[{"value":123}]''))','23514','unsafe binding');
select pg_temp.expect_error('select public.persist_investigation_proposal(current_setting(''cu.i'')::uuid,jsonb_set(pg_temp.curiosity_payload(),''{caseId}'',to_jsonb(gen_random_uuid())))','23514','unknown case');
select pg_temp.expect_error('select public.persist_investigation_proposal(current_setting(''cu.i'')::uuid,jsonb_set(pg_temp.curiosity_payload(),''{evidenceItemIds}'',jsonb_build_array(gen_random_uuid())))','23514','unknown evidence');
select pg_temp.expect_error('select public.persist_investigation_proposal(current_setting(''cu.i'')::uuid,jsonb_set(pg_temp.curiosity_payload(),''{dependencyId}'',to_jsonb(current_setting(''cu.p''))))','23514','unexecuted dependency');
select pg_temp.expect_error('update public.investigations set revision=100','42501','direct state denied');
select pg_temp.expect_error('update public.investigation_proposals set status=''APPROVED''','42501','direct approval denied');
select pg_temp.expect_error('delete from public.investigation_citations','42501','citation immutable');
select pg_temp.expect_error('delete from public.investigation_audit_events','42501','audit immutable');
select pg_temp.expect_error('select public.refresh_investigation(current_setting(''cu.i'')::uuid,true)','23514','no invented conclusion');
select pg_temp.expect_error('select public.decide_investigation_proposal(current_setting(''cu.p'')::uuid,0,repeat(''a'',64),true)','23514','exact approval');
select pg_temp.expect_error('select public.decide_investigation_proposal(current_setting(''cu.p'')::uuid,8,current_setting(''cu.fp''),true)','40001','stale approval');
select public.decide_investigation_proposal(current_setting('cu.p')::uuid,0,current_setting('cu.fp'),true);
select pg_temp.assert_true(public.decide_investigation_proposal(current_setting('cu.p')::uuid,0,current_setting('cu.fp'),true)=current_setting('cu.p')::uuid,'approval retry');
select pg_temp.expect_error('select public.decide_investigation_proposal(current_setting(''cu.p'')::uuid,0,current_setting(''cu.fp''),false)','40001','competing opposite decision');
select set_config('cu.run',public.materialize_investigation_proposal(current_setting('cu.p')::uuid,current_setting('cu.fp'))::text,true);
select pg_temp.assert_true(public.materialize_investigation_proposal(current_setting('cu.p')::uuid,current_setting('cu.fp'))=current_setting('cu.run')::uuid,'materialization retry');
select pg_temp.assert_true((select status='REQUESTED' and decision is null and approved_fingerprint is null from public.execution_runs where id=current_setting('cu.run')::uuid),'M1.7 safety pending');
select pg_temp.assert_true((select case_id=current_setting('exec.case')::uuid from public.execution_runs where id=current_setting('cu.run')::uuid),'existing case only');
select pg_temp.assert_true((select count(*)=4 from public.investigation_audit_events),'no duplicate audit');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.investigations),'cross tenant read');
select pg_temp.assert_true((select count(*)=0 from public.investigation_proposals),'proposal read isolation');
select pg_temp.expect_error('select public.investigation_context(current_setting(''cu.i'')::uuid)','42501','context isolation');
select pg_temp.expect_error('select public.derive_investigation(current_setting(''ev.run'')::uuid)','42501','trigger isolation');
select pg_temp.expect_error('select public.materialize_investigation_proposal(current_setting(''cu.p'')::uuid,current_setting(''cu.fp''))','42501','write isolation');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
reset role;
set local role testpilot_runner;
select set_config('cu.job',public.claim_test_execution()::text,true);
select public.record_execution_safety(current_setting('cu.run')::uuid,(current_setting('cu.job')::jsonb->'run'->>'claim_token')::uuid,'ALLOW','[]','{}','{"method":"GET","url":"https://api.example.test/users","headers":{},"body":null,"assertions":[],"operationPointer":"#/info"}',repeat('d',64));
select set_config('cu.job',public.claim_test_execution()::text,true);
select public.finish_test_execution(current_setting('cu.run')::uuid,(current_setting('cu.job')::jsonb->'run'->>'claim_token')::uuid,'{"outcome":"BLOCKED","failure":"SAFETY_BLOCKED","response":null,"assertions":[],"sent":false}');
reset role;
set local role authenticated;
select public.refresh_investigation(current_setting('cu.i')::uuid);
select pg_temp.assert_true((select status='EXECUTED' and result_package_id is not null from public.investigation_proposals),'result evidence linked');
select pg_temp.assert_true((select count(*)=2 from public.evidence_packages),'M1.8 reused');
select public.refresh_investigation(current_setting('cu.i')::uuid,true);
select pg_temp.assert_true((select status='CONCLUDED' and conclusion='STOPPED_BY_POLICY' and conclusion_package_id is not null from public.investigations),'evidence conclusion');
select pg_temp.expect_error('select public.persist_investigation_proposal(current_setting(''cu.i'')::uuid,pg_temp.curiosity_payload())','23514','closed rejects proposals');
select pg_temp.assert_true(public.refresh_investigation(current_setting('cu.i')::uuid,true)=current_setting('cu.i')::uuid,'conclusion retry');
reset role;
select pg_temp.assert_true((select count(*)=4 from pg_class where relnamespace='public'::regnamespace and relname in ('investigations','investigation_proposals','investigation_citations','investigation_audit_events') and relrowsecurity),'all RLS enabled');
select public.validate_execution_runner_role();

-- Separate source, same known operation: actual eligible observation materialization.
select set_config('ev.run',pg_temp.evidence_run('FAILED')::text,true);
set local role authenticated;
select set_config('cu.i',public.derive_investigation(current_setting('ev.run')::uuid)::text,true);
select set_config('cu.binding',(public.investigation_context(current_setting('cu.i')::uuid)->'observedValues'->0)::text,true);
select set_config('cu.payload',jsonb_set(jsonb_set(pg_temp.curiosity_payload(),'{evidenceItemIds}',jsonb_build_array(current_setting('cu.binding')::jsonb->>'evidenceItemId')),'{bindings}',jsonb_build_array(current_setting('cu.binding')::jsonb-array['caseId','value']))::text,true);
select set_config('cu.p',public.persist_investigation_proposal(current_setting('cu.i')::uuid,current_setting('cu.payload')::jsonb)::text,true);
select set_config('cu.fp',(select fingerprint from public.investigation_proposals where id=current_setting('cu.p')::uuid),true);
select pg_temp.assert_true((select observed_status=500 from public.investigation_proposals where id=current_setting('cu.p')::uuid),'literal derived from immutable response only');
select public.decide_investigation_proposal(current_setting('cu.p')::uuid,0,current_setting('cu.fp'),true);
select set_config('cu.run',public.materialize_investigation_proposal(current_setting('cu.p')::uuid,current_setting('cu.fp'))::text,true);
select pg_temp.assert_true((select execution_case_id<>case_id from public.investigation_proposals where id=current_setting('cu.p')::uuid),'new case snapshot rather than overwrite');
select pg_temp.assert_true((select definition->'input'->>'strategy'='OBSERVED_STATUS' and definition->'input'->'value'='500' from public.test_items where id=(select execution_case_id from public.investigation_proposals where id=current_setting('cu.p')::uuid)),'controlled observed input DSL');
select pg_temp.assert_true((select definition->'input'->>'strategy'='DECLARED_TYPE' from public.test_items where id=current_setting('exec.case')::uuid),'template case unchanged');
select pg_temp.assert_true((select status='REQUESTED' and decision is null from public.execution_runs where id=current_setting('cu.run')::uuid),'observed binding still subject to M1.7 safety');
select pg_temp.assert_true(public.materialize_investigation_proposal(current_setting('cu.p')::uuid,current_setting('cu.fp'))=current_setting('cu.run')::uuid,'observed binding materialization retry');
select public.refresh_investigation(current_setting('cu.i')::uuid,false,true);
select pg_temp.assert_true((select status='STOPPED' from public.investigations where id=current_setting('cu.i')::uuid),'explicit human stop');
select pg_temp.assert_true((select status='CANCELLED' from public.execution_runs where id=current_setting('cu.run')::uuid),'stop cancels queued run');
reset role;

-- Budget/error/approval boundaries against a fresh persisted source.
select set_config('ev.run',pg_temp.evidence_run('FAILED')::text,true);
set local role authenticated;
select set_config('cu.i',public.derive_investigation(current_setting('ev.run')::uuid)::text,true);
select set_config('cu.p',public.persist_investigation_proposal(current_setting('cu.i')::uuid,pg_temp.curiosity_payload())::text,true);
select set_config('cu.fp',(select fingerprint from public.investigation_proposals where id=current_setting('cu.p')::uuid),true);
select set_config('cu.other',jsonb_set(pg_temp.curiosity_payload(),'{evidenceItemIds}',jsonb_build_array((select id from public.evidence_items where package_id=(select source_package_id from public.investigations where id=current_setting('cu.i')::uuid) and id<>(pg_temp.curiosity_payload()->'evidenceItemIds'->>0)::uuid order by id limit 1)))::text,true);
select set_config('cu.second',public.persist_investigation_proposal(current_setting('cu.i')::uuid,current_setting('cu.other')::jsonb)::text,true);
select pg_temp.assert_true(current_setting('cu.second')<>current_setting('cu.p'),'materially distinct grounded proposal');
select pg_temp.expect_error('select public.persist_investigation_proposal(current_setting(''cu.i'')::uuid,jsonb_set(pg_temp.curiosity_payload(),''{evidenceItemIds}'',jsonb_build_array((select id from public.evidence_items where id<>(pg_temp.curiosity_payload()->''evidenceItemIds''->>0)::uuid and id<>(current_setting(''cu.other'')::jsonb->''evidenceItemIds''->>0)::uuid order by id limit 1))))','23514','repeated operation attempts bounded');
select pg_temp.expect_error('select public.persist_investigation_proposal(current_setting(''cu.i'')::uuid,jsonb_set(pg_temp.curiosity_payload(),''{evidenceItemIds}'',jsonb_build_array((select id from public.evidence_items where package_id<>(select source_package_id from public.investigations where id=current_setting(''cu.i'')::uuid) limit 1))))','23514','out of investigation evidence denied');
select pg_temp.expect_error('select public.derive_investigation(current_setting(''ev.run'')::uuid,gen_random_uuid())','23514','forged finding source denied');
select public.decide_investigation_proposal(current_setting('cu.p')::uuid,0,current_setting('cu.fp'),true);
-- Owner-controlled test-only membership setup, never changes database roles.
reset role;
update public.workspace_members set role='MEMBER' where workspace_id=current_setting('test.g_wa')::uuid;
set local role authenticated;
select pg_temp.expect_error('select public.decide_investigation_proposal(current_setting(''cu.second'')::uuid,0,(select fingerprint from public.investigation_proposals where id=current_setting(''cu.second'')::uuid),true)','42501','member cannot approve');
select pg_temp.expect_error('select public.materialize_investigation_proposal(current_setting(''cu.p'')::uuid,current_setting(''cu.fp''))','42501','approver demotion invalidates approval');
reset role;
update public.workspace_members set role='OWNER' where workspace_id=current_setting('test.g_wa')::uuid;
set local role authenticated;
select public.review_test_item(current_setting('exec.case')::uuid,(select id from public.test_reviews where item_id=current_setting('exec.case')::uuid order by revision desc limit 1),'APPROVE','Reapproved fixture.',null,null,null);
select pg_temp.expect_error('select public.materialize_investigation_proposal(current_setting(''cu.p'')::uuid,current_setting(''cu.fp''))','40001','template review changes invalidate approval');
select pg_temp.assert_true((select run_id is null from public.investigation_proposals where id=current_setting('cu.p')::uuid),'no partial run on stale planning');
reset role;
update public.investigations set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where id=current_setting('cu.i')::uuid;
set local role authenticated;
select pg_temp.expect_error('select public.persist_investigation_proposal(current_setting(''cu.i'')::uuid,pg_temp.curiosity_payload())','23514','expiration database enforced');
select pg_temp.expect_error('select public.decide_investigation_proposal(current_setting(''cu.second'')::uuid,0,(select fingerprint from public.investigation_proposals where id=current_setting(''cu.second'')::uuid),true)','23514','expired approval denied');
select pg_temp.expect_error('select public.materialize_investigation_proposal(current_setting(''cu.p'')::uuid,current_setting(''cu.fp''))','23514','expired materialization denied');
reset role;
set local role testpilot_runner;
-- Temporary assertion helper requires local authenticated access, so inspect authority as owner below.
reset role;
select pg_temp.assert_true(not has_table_privilege('testpilot_runner','public.investigations','SELECT'),'runner no curiosity reads');
select pg_temp.assert_true(not has_function_privilege('testpilot_runner','public.materialize_investigation_proposal(uuid,text)','EXECUTE'),'runner no new RPC');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.curiosity_lock(uuid)','EXECUTE'),'private helper unavailable');
select pg_temp.assert_true(not has_function_privilege('anon','public.derive_investigation(uuid,uuid)','EXECUTE'),'anonymous no trigger');
select pg_temp.assert_true(not has_function_privilege('service_role','public.persist_investigation_proposal(uuid,jsonb)','EXECUTE'),'no service role assumption');
select pg_temp.assert_true((select count(*)=6 from pg_proc where pronamespace='public'::regnamespace and proname in ('derive_investigation','investigation_context','persist_investigation_proposal','decide_investigation_proposal','materialize_investigation_proposal','refresh_investigation') and prosecdef and proconfig=array['search_path=""']),'all RPC security definer paths safe');

-- Atomic rollback after a bound case would be created, but target readiness fails.
select set_config('ev.run',pg_temp.evidence_run('FAILED')::text,true);
set local role authenticated;
select set_config('cu.i',public.derive_investigation(current_setting('ev.run')::uuid)::text,true);
select set_config('cu.binding',(public.investigation_context(current_setting('cu.i')::uuid)->'observedValues'->0)::text,true);
select set_config('cu.payload',jsonb_set(jsonb_set(pg_temp.curiosity_payload(),'{evidenceItemIds}',jsonb_build_array(current_setting('cu.binding')::jsonb->>'evidenceItemId')),'{bindings}',jsonb_build_array(current_setting('cu.binding')::jsonb-array['caseId','value']))::text,true);
select set_config('cu.p',public.persist_investigation_proposal(current_setting('cu.i')::uuid,current_setting('cu.payload')::jsonb)::text,true);
select set_config('cu.fp',(select fingerprint from public.investigation_proposals where id=current_setting('cu.p')::uuid),true);
select public.decide_investigation_proposal(current_setting('cu.p')::uuid,0,current_setting('cu.fp'),true);
select public.configure_execution_environment(current_setting('exec.environment')::uuid,'https://api.example.test/',443,false);
select set_config('cu.before',jsonb_build_array((select count(*) from public.test_items),(select count(*) from public.test_reviews),(select count(*) from public.execution_runs),(select count(*) from public.investigation_audit_events))::text,true);
select pg_temp.expect_error('select public.materialize_investigation_proposal(current_setting(''cu.p'')::uuid,current_setting(''cu.fp''))','23514','disabled target fails atomically');
select pg_temp.assert_true(current_setting('cu.before')::jsonb=jsonb_build_array((select count(*) from public.test_items),(select count(*) from public.test_reviews),(select count(*) from public.execution_runs),(select count(*) from public.investigation_audit_events)),'no partial case review run or audit');
select pg_temp.assert_true((select status='APPROVED' and run_id is null and execution_case_id is null from public.investigation_proposals where id=current_setting('cu.p')::uuid),'failed materialization unchanged');
reset role;

-- Owner-controlled metadata fixtures isolate quota/depth enforcement; no HTTP.
set local role authenticated;
select public.configure_execution_environment(current_setting('exec.environment')::uuid,'https://api.example.test/',443,true);
select set_config('cu.r1',public.request_test_execution(current_setting('exec.case')::uuid,current_setting('exec.environment')::uuid)::text,true);
select set_config('cu.r2',public.request_test_execution(current_setting('exec.case')::uuid,current_setting('exec.environment')::uuid)::text,true);
select set_config('cu.r3',public.request_test_execution(current_setting('exec.case')::uuid,current_setting('exec.environment')::uuid)::text,true);
reset role;
do $$ declare n integer;template jsonb;signature text;
begin
 select to_jsonb(p) into template from public.investigation_proposals p where id=current_setting('cu.p')::uuid;
 for n in 1..3 loop
 signature:=md5('quota-fixture-'||n)||md5('quota-fixture-'||n);
 insert into public.investigation_proposals select (jsonb_populate_record(null::public.investigation_proposals,template||jsonb_build_object('id',gen_random_uuid(),'fingerprint',signature,'approved_fingerprint',signature,'status','MATERIALIZED','run_id',current_setting('cu.r'||n)::uuid,'execution_case_id',current_setting('exec.case')::uuid))).*;
 end loop;
end;$$;
set local role authenticated;
select pg_temp.expect_error('select public.materialize_investigation_proposal(current_setting(''cu.p'')::uuid,current_setting(''cu.fp''))','23514','three executable steps maximum enforced in database');
reset role;
-- A completed, evidence-backed depth-2 parent cannot produce depth 3.
-- Removing only local fixture metadata avoids conflating this assertion with repeat quota.
delete from public.investigation_audit_events where investigation_id=current_setting('cu.i')::uuid;
delete from public.investigation_citations where investigation_id=current_setting('cu.i')::uuid;
delete from public.investigation_proposals where investigation_id=current_setting('cu.i')::uuid and id<>current_setting('cu.p')::uuid;
update public.investigation_proposals set status='EXECUTED',depth=2,execution_case_id=current_setting('exec.case')::uuid,run_id=current_setting('ev.run')::uuid,result_package_id=(select source_package_id from public.investigations where id=current_setting('cu.i')::uuid) where id=current_setting('cu.p')::uuid;
set local role authenticated;
select pg_temp.expect_error('select public.persist_investigation_proposal(current_setting(''cu.i'')::uuid,jsonb_set(pg_temp.curiosity_payload(),''{dependencyId}'',to_jsonb(current_setting(''cu.p''))))','23514','maximum depth database enforced');
reset role;
-- Seed eight distinct owner-controlled proposals to exercise the hard cardinality ceiling.
do $$ declare n integer;template jsonb;signature text;
begin
 select to_jsonb(p) into template from public.investigation_proposals p where id=current_setting('cu.p')::uuid;
 for n in 1..7 loop
 signature:=md5('proposal-quota-fixture-'||n)||md5('proposal-quota-fixture-'||n);
 insert into public.investigation_proposals select (jsonb_populate_record(null::public.investigation_proposals,template||jsonb_build_object('id',gen_random_uuid(),'fingerprint',signature,'approved_fingerprint',null,'status','REJECTED','run_id',null,'execution_case_id',null,'result_package_id',null,'depth',0))).*;
 end loop;
end;$$;
set local role authenticated;
select pg_temp.expect_error('select public.persist_investigation_proposal(current_setting(''cu.i'')::uuid,pg_temp.curiosity_payload())','23514','eight proposed steps ceiling database enforced');
reset role;
select count(*) as m19_assertions from pg_temp.qa_results;
rollback;
