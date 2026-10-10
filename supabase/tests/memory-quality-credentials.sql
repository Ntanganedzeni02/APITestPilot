-- Disposable local security fixtures only; all synthetic values and writes roll back.
\ir fixtures/curiosity-source.sql
truncate pg_temp.qa_results;
-- Equivalent imported operation fixture; keep all tenant/source/graph references valid.
select set_config('m.unsafe_path','/postgresql://fixture:fixture@db.example.invalid/db',true);
select set_config('m.unsafe_operation',jsonb_build_array('OPERATION','GET '||current_setting('m.unsafe_path'))::text,true);
insert into public.behaviour_graph_nodes(graph_id,logical_id,api_import_id,project_id,workspace_id,type,label,provenance)
 select graph_id,current_setting('m.unsafe_operation'),api_import_id,project_id,workspace_id,type,label,provenance from public.behaviour_graph_nodes where graph_id=current_setting('test.g_first')::uuid and logical_id='["OPERATION","GET /users"]';
update public.api_imports set knowledge=jsonb_set(jsonb_set(knowledge,'{operations,0,path}',to_jsonb(current_setting('m.unsafe_path'))),'{operations,0,key}',to_jsonb('GET '||current_setting('m.unsafe_path'))) where id=current_setting('test.g_import')::uuid;
update public.test_item_nodes set node_id=current_setting('m.unsafe_operation') where item_id=current_setting('exec.case')::uuid and node_id='["OPERATION","GET /users"]';
update public.test_items set definition=jsonb_set(definition,'{nodeRefs}',jsonb_build_array(current_setting('m.unsafe_operation'))) where id=current_setting('exec.case')::uuid;
select pg_temp.assert_true(public.curiosity_operation(current_setting('exec.case')::uuid)=current_setting('m.unsafe_operation'),'fixture reaches actual operation derivation');
select pg_temp.assert_true(not public.memory_operation_safe(current_setting('m.unsafe_operation')),'URI credential rejected');
select pg_temp.assert_true(not public.memory_operation_safe(jsonb_build_array('OPERATION','GET /Bearer fixture-token')::text),'Bearer credential rejected');
select pg_temp.assert_true(not public.memory_operation_safe(jsonb_build_array('OPERATION','GET /api_key=fixture')::text),'API assignment rejected');
select pg_temp.assert_true(not public.memory_operation_safe(jsonb_build_array('OPERATION','GET /password=fixture')::text),'password assignment rejected');
select pg_temp.assert_true(not public.memory_operation_safe(jsonb_build_array('OPERATION','GET /postgresql%3A%2F%2Ffixture%3Afixture%40db.example.invalid/db')::text),'encoded URI rejected');
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
select public.refresh_project_memory(current_setting('test.g_pa')::uuid,current_setting('exec.environment')::uuid);
select pg_temp.assert_true((select count(*)=1 and bool_and(operation_id is null) from public.memory_facts),'failed observation retained without unsafe identifier');
select set_config('m.investigation',public.derive_investigation(current_setting('ev.run')::uuid)::text,true);
select public.refresh_investigation(current_setting('m.investigation')::uuid,false,true);
select public.refresh_project_memory(current_setting('test.g_pa')::uuid,current_setting('exec.environment')::uuid);
select pg_temp.assert_true((select count(*)=1 from public.memory_observations where investigation_id=current_setting('m.investigation')::uuid and claim='STOPPED_BY_POLICY' and run_id=current_setting('ev.run')::uuid and package_id is not null),'stopped investigation safe provenance retained');
select pg_temp.assert_true((select bool_and(operation_id is null) from public.project_memory),'persisted UI query source exposes only absent identifiers');
select pg_temp.assert_true(not exists(select 1 from public.memory_facts f where to_jsonb(f)::text like '%fixture:fixture%'),'facts contain no credential fixture');
select pg_temp.assert_true(not exists(select 1 from public.memory_observations o where to_jsonb(o)::text like '%fixture:fixture%'),'observations contain no credential fixture');
select public.assess_project_quality(current_setting('test.g_pa')::uuid,current_setting('exec.environment')::uuid);
select pg_temp.assert_true(not exists(select 1 from public.quality_assessments a where to_jsonb(a)::text like '%fixture:fixture%'),'assessment explanations and provenance contain no credential fixture');
reset role;
select pg_temp.expect_error('update public.memory_facts set operation_id=current_setting(''m.unsafe_operation'')','23514','constraint independently denies unsafe persistence');
select set_config('m.success_run',pg_temp.evidence_run('PASSED')::text,true);
set local role authenticated;
select public.refresh_project_memory(current_setting('test.g_pa')::uuid,current_setting('exec.environment')::uuid);
select pg_temp.assert_true(not exists(select 1 from public.memory_facts where kind='OPERATION_VERIFIED_SUCCESS'),'success requires safe operation attribution');
select pg_temp.assert_true((select count(*)=2 from public.memory_facts),'other safe provenance facts preserved');
reset role;
select count(*) as credential_assertions_passed from pg_temp.qa_results;
rollback;
