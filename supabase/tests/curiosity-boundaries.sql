-- Local disposable persistence/security fixtures. No HTTP or hosted access.
\ir fixtures/curiosity-source.sql
truncate pg_temp.qa_results;
create function pg_temp.cu_payload(binding boolean default false) returns jsonb language sql as $$
 select jsonb_build_object('caseId',current_setting('exec.case'),'hypothesis','Repeat the selected case to assess its declared assertions.','rationale','Local boundary regression fixture.','confidence','LOW','evidenceItemIds',jsonb_build_array(coalesce(b->>'evidenceItemId',(select id::text from public.evidence_items where package_id=(select source_package_id from public.investigations where id=current_setting('cu.i')::uuid) order by id limit 1))),'dependencyId',null,'bindings',case when binding then jsonb_build_array(b-array['caseId','value']) else '[]'::jsonb end)
 from (select public.investigation_context(current_setting('cu.i')::uuid)->'observedValues'->0 b) x;
$$;
create function pg_temp.cu_new(binding boolean default false) returns uuid language plpgsql as $$
declare r uuid;x uuid;
begin
 -- Finish unrelated queued fixtures before the runner claim fixture is used again.
 execute 'set local role authenticated';
 for r in select id from public.execution_runs where status='REQUESTED' loop perform public.cancel_test_execution(r);end loop;
 execute 'reset role';r:=pg_temp.evidence_run('FAILED');
 execute 'set local role authenticated';
 x:=public.derive_investigation(r);perform set_config('cu.i',x::text,true);
 perform set_config('cu.p',public.persist_investigation_proposal(x,pg_temp.cu_payload(binding))::text,true);
 perform set_config('cu.fp',(select fingerprint from public.investigation_proposals where id=current_setting('cu.p')::uuid),true);
 perform public.decide_investigation_proposal(current_setting('cu.p')::uuid,0,current_setting('cu.fp'),true);
 execute 'reset role';return x;
end;$$;
select pg_temp.cu_new(true);
set local role authenticated;
select set_config('cu.run',public.materialize_investigation_proposal(current_setting('cu.p')::uuid,current_setting('cu.fp'))::text,true);
select set_config('cu.case',(select execution_case_id::text from public.investigation_proposals where id=current_setting('cu.p')::uuid),true);
select pg_temp.expect_error('select public.request_test_execution(current_setting(''cu.case'')::uuid,current_setting(''exec.environment'')::uuid)','23514','generated case ordinary escape denied');
select pg_temp.assert_true(public.materialize_investigation_proposal(current_setting('cu.p')::uuid,current_setting('cu.fp'))=current_setting('cu.run')::uuid,'authorized generated retry returns original run');
select set_config('cu.alt',(select id::text from public.environments where project_id=current_setting('test.g_pa')::uuid and type='STAGING'),true);
select public.configure_execution_environment(current_setting('cu.alt')::uuid,'https://api.example.test/',443,true);
select pg_temp.expect_error('select public.request_test_execution(current_setting(''cu.case'')::uuid,current_setting(''cu.alt'')::uuid)','23514','generated case alternate environment denied');
select pg_temp.expect_error('select public.execution_request_base(current_setting(''cu.case'')::uuid,current_setting(''exec.environment'')::uuid)','42501','private M1.7 base denied');
select pg_temp.expect_error('select public.curiosity_request_execution(current_setting(''cu.p'')::uuid,current_setting(''cu.fp''),current_setting(''cu.case'')::uuid,current_setting(''exec.environment'')::uuid)','42501','private provenance gate denied');
reset role;
select pg_temp.expect_error('select public.curiosity_request_execution(current_setting(''cu.p'')::uuid,current_setting(''cu.fp''),current_setting(''cu.case'')::uuid,current_setting(''cu.alt'')::uuid)','23514','private gate pins environment even for retry');
select pg_temp.assert_true((select count(*)=1 from public.execution_runs where case_id=current_setting('cu.case')::uuid),'one authorized generated request');
select pg_temp.cu_new();
set local role authenticated;
select set_config('cu.ordinary',public.request_test_execution(current_setting('exec.case')::uuid,current_setting('exec.environment')::uuid)::text,true);
select pg_temp.assert_true((select status='REQUESTED' from public.execution_runs where id=current_setting('cu.ordinary')::uuid),'shared ordinary case unaffected by proposal');
select public.cancel_test_execution(current_setting('cu.ordinary')::uuid);
reset role;
-- Gate validates lifecycle before insertion, even through its trusted internal entry.
update public.investigations set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where id=current_setting('cu.i')::uuid;
select pg_temp.expect_error('select public.curiosity_request_execution(current_setting(''cu.p'')::uuid,current_setting(''cu.fp''),current_setting(''exec.case'')::uuid,current_setting(''exec.environment'')::uuid)','23514','expired request denied at boundary');
select pg_temp.assert_true((select run_id is null from public.investigation_proposals where id=current_setting('cu.p')::uuid),'expired request creates no work');
select pg_temp.cu_new();
set local role authenticated;
select public.refresh_investigation(current_setting('cu.i')::uuid,false,true);
reset role;
select pg_temp.expect_error('select public.curiosity_request_execution(current_setting(''cu.p'')::uuid,current_setting(''cu.fp''),current_setting(''exec.case'')::uuid,current_setting(''exec.environment'')::uuid)','23514','stopped request denied at boundary');
select pg_temp.cu_new();
update public.investigations set status='CONCLUDED',conclusion='INCONCLUSIVE' where id=current_setting('cu.i')::uuid;
select pg_temp.expect_error('select public.curiosity_request_execution(current_setting(''cu.p'')::uuid,current_setting(''cu.fp''),current_setting(''exec.case'')::uuid,current_setting(''exec.environment'')::uuid)','23514','concluded request denied at boundary');
select pg_temp.cu_new();
update public.investigation_proposals set approved_fingerprint=null,status='REJECTED' where id=current_setting('cu.p')::uuid;
select pg_temp.expect_error('select public.curiosity_request_execution(current_setting(''cu.p'')::uuid,current_setting(''cu.fp''),current_setting(''exec.case'')::uuid,current_setting(''exec.environment'')::uuid)','23514','invalidated approval denied at boundary');

-- Two genuine authorized attempts are accepted, the third operation proposal is not.
select pg_temp.cu_new();
set local role authenticated;
select set_config('cu.first',public.materialize_investigation_proposal(current_setting('cu.p')::uuid,current_setting('cu.fp'))::text,true);
select set_config('cu.other',jsonb_set(pg_temp.cu_payload(),'{evidenceItemIds}',jsonb_build_array((select id from public.evidence_items where package_id=(select source_package_id from public.investigations where id=current_setting('cu.i')::uuid) and id<>(pg_temp.cu_payload()->'evidenceItemIds'->>0)::uuid order by id limit 1)))::text,true);
select set_config('cu.second',public.persist_investigation_proposal(current_setting('cu.i')::uuid,current_setting('cu.other')::jsonb)::text,true);
select public.decide_investigation_proposal(current_setting('cu.second')::uuid,0,(select fingerprint from public.investigation_proposals where id=current_setting('cu.second')::uuid),true);
select public.materialize_investigation_proposal(current_setting('cu.second')::uuid,(select fingerprint from public.investigation_proposals where id=current_setting('cu.second')::uuid));
select pg_temp.assert_true((select count(*)=2 from public.investigation_proposals where investigation_id=current_setting('cu.i')::uuid and run_id is not null),'two operation requests permitted');
select pg_temp.expect_error('select public.persist_investigation_proposal(current_setting(''cu.i'')::uuid,jsonb_set(pg_temp.cu_payload(),''{evidenceItemIds}'',(select jsonb_agg(id order by id) from public.evidence_items where package_id=(select source_package_id from public.investigations where id=current_setting(''cu.i'')::uuid))))','23514','third operation proposal denied');
reset role;
select pg_temp.assert_true((select p.fingerprint=public.curiosity_fingerprint(i,c,plan,p.case_review_id,p.scenario_review_id,p.payload,p.observed_status) from public.investigation_proposals p join public.investigations i on i.id=p.investigation_id join public.test_items c on c.id=p.case_id join public.test_plans plan on plan.id=p.plan_id where p.id=current_setting('cu.p')::uuid),'captured review identities match canonical fingerprint');
select pg_temp.assert_true((select p.fingerprint<>public.curiosity_fingerprint(jsonb_populate_record(null::public.investigations,to_jsonb(i)||jsonb_build_object('environment_id',current_setting('cu.alt'))),c,plan,p.case_review_id,p.scenario_review_id,p.payload,p.observed_status) from public.investigation_proposals p join public.investigations i on i.id=p.investigation_id join public.test_items c on c.id=p.case_id join public.test_plans plan on plan.id=p.plan_id where p.id=current_setting('cu.p')::uuid),'environment change invalidates canonical approval fingerprint');

-- Real persisted runner results, linked via owner-controlled quota/conclusion metadata.
select pg_temp.cu_new();
select set_config('cu.pass',pg_temp.evidence_run('PASSED')::text,true);
select set_config('cu.fail',pg_temp.evidence_run('FAILED')::text,true);
set local role authenticated;
select set_config('cu.passpkg',public.derive_execution_evidence(current_setting('cu.pass')::uuid)::text,true);
select set_config('cu.failpkg',public.derive_execution_evidence(current_setting('cu.fail')::uuid)::text,true);
reset role;
create function pg_temp.cu_step(run_input uuid,pkg uuid,state text,ordinal integer) returns uuid language plpgsql as $$
declare template jsonb;result uuid:=gen_random_uuid();signature text:=repeat(md5('local-boundary-'||ordinal),2);
begin
 select to_jsonb(p) into template from public.investigation_proposals p where id=current_setting('cu.p')::uuid;
 insert into public.investigation_proposals select (jsonb_populate_record(null::public.investigation_proposals,template||jsonb_build_object('id',result,'fingerprint',signature,'approved_fingerprint',signature,'status',state,'run_id',run_input,'execution_case_id',case when run_input is not null then current_setting('exec.case')::uuid end,'result_package_id',pkg,'revision',2,'created_at',clock_timestamp()+ordinal*interval '1 microsecond'))).*;
 return result;
end;$$;
-- Replace the unused initial proposal with completed trusted fixture evidence.
update public.investigation_proposals set status='EXECUTED',run_id=current_setting('cu.pass')::uuid,execution_case_id=case_id,result_package_id=current_setting('cu.passpkg')::uuid where id=current_setting('cu.p')::uuid;
set local role authenticated;
select public.refresh_investigation(current_setting('cu.i')::uuid,true);
select pg_temp.assert_true((select conclusion='HYPOTHESIS_SUPPORTED' and conclusion_package_id=current_setting('cu.passpkg')::uuid from public.investigations where id=current_setting('cu.i')::uuid),'passed only supported with passed evidence');
reset role;
-- Reopen only local fixture state to independently test aggregation permutations.
update public.investigations set status='OPEN',conclusion=null,conclusion_package_id=null where id=current_setting('cu.i')::uuid;
select set_config('cu.failedstep',pg_temp.cu_step(current_setting('cu.fail')::uuid,current_setting('cu.failpkg')::uuid,'EXECUTED',1)::text,true);
set local role authenticated;
select public.refresh_investigation(current_setting('cu.i')::uuid,true);
select pg_temp.assert_true((select conclusion='HYPOTHESIS_NOT_SUPPORTED' and conclusion_package_id=current_setting('cu.failpkg')::uuid from public.investigations where id=current_setting('cu.i')::uuid),'mixed passed failed selects failed evidence');
select pg_temp.assert_true(not exists(select 1 from public.finding_reviews where decision='CONFIRM'),'conclusion does not confirm finding');
reset role;
delete from public.investigation_proposals where id=current_setting('cu.failedstep')::uuid;
update public.investigations set status='OPEN',conclusion=null,conclusion_package_id=null where id=current_setting('cu.i')::uuid;
set local role authenticated;
select set_config('cu.cancel',public.request_test_execution(current_setting('exec.case')::uuid,current_setting('exec.environment')::uuid)::text,true);
select public.cancel_test_execution(current_setting('cu.cancel')::uuid);
reset role;
select set_config('cu.cancelstep',pg_temp.cu_step(current_setting('cu.cancel')::uuid,null,'BLOCKED',2)::text,true);
set local role authenticated;
select public.refresh_investigation(current_setting('cu.i')::uuid,true);
select pg_temp.assert_true((select conclusion='INCONCLUSIVE' and conclusion_package_id is null from public.investigations where id=current_setting('cu.i')::uuid),'passed plus cancelled not supported');
reset role;
update public.execution_runs set status='BLOCKED',decision='BLOCK' where id=current_setting('cu.cancel')::uuid;
update public.investigations set status='OPEN',conclusion=null where id=current_setting('cu.i')::uuid;
set local role authenticated;
select public.refresh_investigation(current_setting('cu.i')::uuid,true);
select pg_temp.assert_true((select conclusion='INCONCLUSIVE' from public.investigations where id=current_setting('cu.i')::uuid),'passed plus policy blocked not supported');
select set_config('cu.third',public.request_test_execution(current_setting('exec.case')::uuid,current_setting('exec.environment')::uuid)::text,true);
select public.cancel_test_execution(current_setting('cu.third')::uuid);
reset role;
update public.investigations set status='OPEN',conclusion=null where id=current_setting('cu.i')::uuid;
select pg_temp.cu_step(current_setting('cu.third')::uuid,null,'BLOCKED',3);
set local role authenticated;
select public.refresh_investigation(current_setting('cu.i')::uuid,true);
select pg_temp.assert_true((select conclusion='BUDGET_EXHAUSTED' and conclusion_package_id is null from public.investigations where id=current_setting('cu.i')::uuid),'mixed incomplete work at execution ceiling budget exhausted');
reset role;
-- Reuse the same trusted quota fixture, but a new approved proposal must be denied.
update public.investigations set status='OPEN',conclusion=null where id=current_setting('cu.i')::uuid;
select set_config('cu.next',pg_temp.cu_step(null,null,'APPROVED',4)::text,true);
update public.investigation_proposals set execution_case_id=null,revision=1 where id=current_setting('cu.next')::uuid;
select pg_temp.expect_error('select public.curiosity_request_execution(current_setting(''cu.next'')::uuid,(select fingerprint from public.investigation_proposals where id=current_setting(''cu.next'')::uuid),current_setting(''exec.case'')::uuid,current_setting(''exec.environment'')::uuid)','23514','three step quota at M1.7 gate');
delete from public.investigation_proposals where run_id=current_setting('cu.third')::uuid;
select pg_temp.expect_error('select public.curiosity_request_execution(current_setting(''cu.next'')::uuid,(select fingerprint from public.investigation_proposals where id=current_setting(''cu.next'')::uuid),current_setting(''exec.case'')::uuid,current_setting(''exec.environment'')::uuid)','23514','third operation attempt denied at M1.7 gate');

-- A legitimately authorized in-flight run finishes after the human stop.
select pg_temp.cu_new();
set local role authenticated;
select set_config('cu.run',public.materialize_investigation_proposal(current_setting('cu.p')::uuid,current_setting('cu.fp'))::text,true);
reset role;
set local role testpilot_runner;
select set_config('cu.job',public.claim_test_execution()::text,true);
select public.record_execution_safety(current_setting('cu.run')::uuid,(current_setting('cu.job')::jsonb->'run'->>'claim_token')::uuid,'ALLOW','[]','{}','{"method":"GET","url":"https://api.example.test/","headers":{},"body":null,"assertions":[{"kind":"STATUS_IN_DECLARED_SET","expected":[200],"pointer":"#/info"}],"operationPointer":"#/info"}',repeat('c',64));
select set_config('cu.job',public.claim_test_execution()::text,true);
select set_config('cu.sent',public.authorize_execution_send(current_setting('cu.run')::uuid,(current_setting('cu.job')::jsonb->'run'->>'claim_token')::uuid,repeat('c',64),(current_setting('cu.job')::jsonb->'run'->>'config_id')::uuid,'1.0.0')::text,true);
reset role;
set local role authenticated;
select pg_temp.assert_true(current_setting('cu.sent')::boolean,'late fixture legitimately authorized before stop');
select public.refresh_investigation(current_setting('cu.i')::uuid,false,true);
select pg_temp.assert_true((select status='STOPPED' from public.investigations where id=current_setting('cu.i')::uuid),'stop closes lifecycle before late result');
select pg_temp.expect_error('select public.persist_investigation_proposal(current_setting(''cu.i'')::uuid,pg_temp.cu_payload())','23514','stopped investigation no new proposals');
select pg_temp.expect_error('select public.decide_investigation_proposal(current_setting(''cu.p'')::uuid,0,current_setting(''cu.fp''),true)','23514','stopped investigation no new approvals');
reset role;
select set_config('cu.counts',jsonb_build_array((select count(*) from public.investigation_proposals),(select count(*) from public.execution_runs))::text,true);
select set_config('cu.result',(select result::text from public.execution_results where run_id=current_setting('cu.pass')::uuid),true);
set local role testpilot_runner;
select public.finish_test_execution(current_setting('cu.run')::uuid,(current_setting('cu.job')::jsonb->'run'->>'claim_token')::uuid,current_setting('cu.result')::jsonb);
reset role;
set local role authenticated;
select public.refresh_investigation(current_setting('cu.i')::uuid);
select pg_temp.assert_true((select status='EXECUTED' and result_package_id is not null from public.investigation_proposals where id=current_setting('cu.p')::uuid),'late result evidence reconciled');
select pg_temp.assert_true((select status='STOPPED' and conclusion='STOPPED_BY_POLICY' from public.investigations where id=current_setting('cu.i')::uuid),'late refresh preserves stop');
select set_config('cu.audit',(select count(*)::text from public.investigation_audit_events where investigation_id=current_setting('cu.i')::uuid),true);
select public.refresh_investigation(current_setting('cu.i')::uuid);
select pg_temp.assert_true((select count(*)::text=current_setting('cu.audit') from public.investigation_audit_events where investigation_id=current_setting('cu.i')::uuid),'late refresh audit idempotent');
select pg_temp.assert_true(current_setting('cu.counts')::jsonb=jsonb_build_array((select count(*) from public.investigation_proposals),(select count(*) from public.execution_runs)),'late reconciliation no new work');
reset role;
select public.validate_execution_runner_role();
select count(*) as m19_boundary_assertions from pg_temp.qa_results;
rollback;
