-- Disposable local PostgreSQL/Supabase-compatible assertion fixture only.
-- Requires bootstrap and M1.2/M1.3/M1.4/M1.5 migrations; never bootstrap hosted Auth.
begin;
create temporary table qa_results(label text primary key);
grant all on pg_temp.qa_results to authenticated;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Assertion failed: %',label; end if; insert into pg_temp.qa_results values(label); end; $$;
create function pg_temp.expect_error(command text,expected text,label text) returns void language plpgsql as $$ declare actual text; begin begin execute command; exception when others then actual:=sqlstate; end; perform pg_temp.assert_true(actual=expected,label); end; $$;
insert into auth.users(id,email) values ('14000000-0000-0000-0000-000000000001','m14-a@example.invalid'),('14000000-0000-0000-0000-000000000002','m14-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
select set_config('test.g_wa',public.create_workspace('M14 fixture A')::text,true);
select set_config('test.g_pa',public.create_project(current_setting('test.g_wa')::uuid,'M14 fixture project A')::text,true);
select set_config('test.g_pa2',public.create_project(current_setting('test.g_wa')::uuid,'M14 fixture project A2')::text,true);
select set_config('test.g_import',public.import_api_spec(current_setting('test.g_wa')::uuid,current_setting('test.g_pa')::uuid,'json',null,100,repeat('a',64),'{"info":{}}','{"modelVersion":1,"title":"SQL graph fixture","version":"1","openapiVersion":"3.0.3","operations":[],"components":{}}')::text,true);
select set_config('test.g_import2',public.import_api_spec(current_setting('test.g_wa')::uuid,current_setting('test.g_pa2')::uuid,'json',null,100,repeat('a',64),'{"info":{}}','{"modelVersion":1,"title":"SQL graph fixture","version":"1","openapiVersion":"3.0.3","operations":[],"components":{}}')::text,true);
create function pg_temp.fixture_graph() returns jsonb language sql as $$
 select jsonb_build_object('modelVersion',1,'builderVersion','1.0.0','workspaceId',current_setting('test.g_wa'),'projectId',current_setting('test.g_pa'),'importId',current_setting('test.g_import'),
 'nodes',jsonb_build_array(jsonb_build_object('id',root,'type','API','label','SQL fixture','provenance',p),jsonb_build_object('id',consumer,'type','OPERATION','label','GET /users','provenance',p),jsonb_build_object('id',producer,'type','OPERATION','label','POST /users','provenance',p)),
 'edges',jsonb_build_array(jsonb_build_object('id','["API_HAS_OPERATION",'||to_jsonb(root)::text||','||to_jsonb(consumer)::text||']','type','API_HAS_OPERATION','from',root,'to',consumer,'provenance',p),jsonb_build_object('id','["OPERATION_PRECEDES_OPERATION",'||to_jsonb(producer)::text||','||to_jsonb(consumer)::text||']','type','OPERATION_PRECEDES_OPERATION','from',producer,'to',consumer,'provenance',p)))
 from (select '["API","root"]'::text root,'["OPERATION","GET /users"]'::text consumer,'["OPERATION","POST /users"]'::text producer,jsonb_build_object('importId',current_setting('test.g_import'),'ruleId','DECLARED_STRUCTURE','sourcePointers',jsonb_build_array('#/info'),'derivation','EXPLICIT','confidence','EXACT','evidence',jsonb_build_array('SQL development fixture')) p)x;
$$;
create function pg_temp.save_fixture(payload jsonb) returns uuid language sql as $$ select public.build_behaviour_graph(current_setting('test.g_wa')::uuid,current_setting('test.g_pa')::uuid,current_setting('test.g_import')::uuid,payload); $$;
select set_config('test.g_first',pg_temp.save_fixture(pg_temp.fixture_graph())::text,true);
select set_config('test.dependency_edge',(select logical_id from public.behaviour_graph_edges where graph_id=current_setting('test.g_first')::uuid and type='OPERATION_PRECEDES_OPERATION'),true);
select set_config('test.g_second',pg_temp.save_fixture(pg_temp.fixture_graph())::text,true);
create function pg_temp.qa_proposal(kind text default 'REQUIREMENT') returns jsonb language sql as $$
 select jsonb_build_object('logicalKey',kind,'kind',kind,'title','Declared fixture contract','statement','Review the declared fixture contract.','category',case when kind='REQUIREMENT' then 'FUNCTIONAL' else 'DATA_INTEGRITY' end,'sourceKind','SPEC_EXPLICIT','derivationType','EXPLICIT','confidence','EXACT','ruleId','REQ_FIXTURE','reason','Declared local development evidence','sourcePointers',jsonb_build_array('#/info'),'nodeRefs',jsonb_build_array('["API","root"]'),'edgeRefs','[]'::jsonb,'requirementRefs',case when kind='RISK' then '["REQUIREMENT"]'::jsonb else '[]'::jsonb end,'severity',case when kind='RISK' then 'MEDIUM' end,'priority',case when kind='RISK' then 'ROUTINE' end);
$$;
create function pg_temp.qa_payload() returns jsonb language sql as $$
 select jsonb_build_object('workspaceId',current_setting('test.g_wa'),'projectId',current_setting('test.g_pa'),'importId',current_setting('test.g_import'),'graphId',current_setting('test.g_first'),'engineVersion','1.0.0','aiStatus','NOT_CONFIGURED','aiMetadata',null,'aiFailure',null,'items',jsonb_build_array(pg_temp.qa_proposal(),pg_temp.qa_proposal('RISK')));
$$;
create function pg_temp.save_qa(p jsonb) returns uuid language sql as $$ select public.create_qa_analysis(current_setting('test.g_wa')::uuid,current_setting('test.g_pa')::uuid,current_setting('test.g_import')::uuid,current_setting('test.g_first')::uuid,p); $$;
select set_config('test.qa_first',pg_temp.save_qa(pg_temp.qa_payload())::text,true);
select set_config('test.qa_second',pg_temp.save_qa(pg_temp.qa_payload())::text,true);

select set_config('test.req',(select id::text from public.qa_items where analysis_id=current_setting('test.qa_first')::uuid and kind='REQUIREMENT'),true);
select set_config('test.risk',(select id::text from public.qa_items where analysis_id=current_setting('test.qa_first')::uuid and kind='RISK'),true);
create function pg_temp.test_definition(kind text default 'SCENARIO') returns jsonb language sql as $$
select jsonb_build_object('logicalKey',kind,'kind',kind,'scenarioKey',case when kind='CASE' then 'SCENARIO' end,'title','Bounded planning fixture','objective','Verify declared fixture contract.','testType','CONTRACT','caseType',case when kind='CASE' then 'VALID' end,'priority','ROUTINE','priorityReason','Routine declared coverage.','origin','DETERMINISTIC','derivationType','DETERMINISTIC_INFERENCE','confidence','EXACT','ruleId','TEST_FIXTURE','reason','Declared local fixture.','requirementRefs',jsonb_build_array(current_setting('test.req')),'riskRefs',jsonb_build_array(current_setting('test.risk')),'nodeRefs',jsonb_build_array('['||'"API","root"'||']'),'edgeRefs','[]'::jsonb,'sourcePointers',jsonb_build_array('#/info'),'preconditions','[]'::jsonb,'input',jsonb_build_object('strategy','DECLARED_TYPE','pointer','#/info','value',null),'expectedBehavior','Verify declared contract only.','executable',false);
$$;
create function pg_temp.plan_payload() returns jsonb language sql as $$
select jsonb_build_object('workspaceId',current_setting('test.g_wa'),'projectId',current_setting('test.g_pa'),'importId',current_setting('test.g_import'),'graphId',current_setting('test.g_first'),'analysisId',current_setting('test.qa_first'),'engineVersion','1.0.0','status','DRAFT','aiStatus','NOT_CONFIGURED','aiMetadata',null,'aiFailure',null,'requirements',jsonb_build_array(jsonb_build_object('id',current_setting('test.req'),'reviewId',null,'status','PROPOSED','title','Declared fixture contract','statement','Review the declared fixture contract.')),'items',jsonb_build_array(pg_temp.test_definition(),pg_temp.test_definition('CASE')));
$$;
create function pg_temp.save_plan(p jsonb) returns uuid language sql as $$select public.create_test_plan(current_setting('test.qa_first')::uuid,p);$$;
select set_config('test.plan',pg_temp.save_plan(pg_temp.plan_payload())::text,true);

select set_config('test.case',(select id::text from public.test_items where plan_id=current_setting('test.plan')::uuid and kind='CASE'),true);
select set_config('test.qa_approval',public.review_qa_item(current_setting('test.req')::uuid,null,'APPROVE','',null,null)::text,true);
select set_config('test.eligible',pg_temp.save_plan(jsonb_set(jsonb_set(jsonb_set(pg_temp.plan_payload(),'{requirements,0,status}','"APPROVED"'),'{requirements,0,reviewId}',to_jsonb(current_setting('test.qa_approval'))),'{items,1,executable}','true'))::text,true);
reset role;
