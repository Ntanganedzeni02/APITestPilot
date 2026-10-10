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
select set_config('test.plan2',pg_temp.save_plan(pg_temp.plan_payload())::text,true);
select pg_temp.assert_true(current_setting('test.plan')<>current_setting('test.plan2'),'new planning snapshot UUID');
select pg_temp.assert_true((select count(*)=4 from public.test_items),'complete scenarios and cases persisted');
select pg_temp.assert_true((select count(*)=2 from public.test_requirement_versions),'requirements pinned per plan');
select pg_temp.assert_true((select bool_and(created_by=auth.uid()) from public.test_plans),'caller-derived plan actor');
select pg_temp.assert_true((select count(*)=8 from public.test_item_qa_links),'relational requirement risk links');
select pg_temp.assert_true((select count(*)=4 from public.test_item_nodes),'relational graph nodes');
select pg_temp.assert_true((select count(*)=2 from public.test_audit_events),'plan creation audit');
select pg_temp.expect_error('select pg_temp.save_plan(pg_temp.plan_payload()||''{"workspaceId":"16000000-0000-0000-0000-000000000099"}'')','23514','workspace forgery rejected');
select pg_temp.expect_error('select pg_temp.save_plan(pg_temp.plan_payload()||''{"projectId":"16000000-0000-0000-0000-000000000099"}'')','23514','project forgery rejected');
select pg_temp.expect_error('select pg_temp.save_plan(pg_temp.plan_payload()||''{"graphId":"16000000-0000-0000-0000-000000000099"}'')','23514','graph forgery rejected');
select pg_temp.expect_error('select pg_temp.save_plan(pg_temp.plan_payload()||''{"importId":"16000000-0000-0000-0000-000000000099"}'')','23514','import forgery rejected');
select pg_temp.expect_error('select pg_temp.save_plan(pg_temp.plan_payload()||''{"analysisId":"16000000-0000-0000-0000-000000000099"}'')','23514','analysis forgery rejected');
select pg_temp.expect_error('select pg_temp.save_plan(pg_temp.plan_payload()||''{"status":"APPROVED"}'')','23514','no plan autoapproval');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{requirements,0,status}'',''"APPROVED"''))','23514','requirement approval cannot be forged');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{requirements,0,title}'',''"forged"''))','23514','requirement text cannot be forged');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{items,1,nodeRefs}'',''["missing"]''))','23503','late graph node failure atomic');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{items,1,edgeRefs}'',''["missing"]''))','23503','late graph edge failure atomic');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{items,1,scenarioKey}'',''"missing"''))','23514','missing scenario rejected');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{items,1,sourcePointers}'',''["#/missing"]''))','23514','invented source pointer rejected');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{items,1,requirementRefs}'',''[]''))','23514','disconnected case rejected');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{items,1,logicalKey}'',''"SCENARIO"''))','23505','duplicate semantic key rejected');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{items,1,title}'',to_jsonb(repeat('' '',160)||''X'')))','23514','raw generated title bounded');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{items,1,objective}'',to_jsonb(repeat('' '',4000)||''X'')))','23514','raw generated objective bounded');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{items,1,origin}'',''"AI_PROPOSED"''))','23514','AI origin requires configured metadata');
select pg_temp.assert_true((select count(*)=2 from public.test_plans) and (select count(*)=4 from public.test_items) and (select count(*)=2 from public.test_audit_events),'failed plans leave no partial persistence or audit');
select set_config('test.scenario',(select id::text from public.test_items where plan_id=current_setting('test.plan')::uuid and kind='SCENARIO'),true);
select set_config('test.case',(select id::text from public.test_items where plan_id=current_setting('test.plan')::uuid and kind='CASE'),true);
select set_config('test.review',public.review_test_item(current_setting('test.scenario')::uuid,null,'APPROVE','',null,null,null)::text,true);
select pg_temp.assert_true((select count(*)=1 from public.test_reviews),'scenario approval does not bulk approve cases');
select pg_temp.expect_error('select public.review_test_item(current_setting(''test.scenario'')::uuid,null,''REJECT'','''',null,null,null)','40001','stale planning review rejected');
select set_config('test.review',public.review_test_item(current_setting('test.scenario')::uuid,current_setting('test.review')::uuid,'REJECT','',null,null,null)::text,true);
select pg_temp.assert_true((select decision='REJECT' and revision=2 from public.test_reviews where id=current_setting('test.review')::uuid),'owner rejection appends revision');
reset role;
insert into public.workspace_members(workspace_id,user_id,role) values(current_setting('test.g_wa')::uuid,'14000000-0000-0000-0000-000000000002','MEMBER');
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000002',true);
select pg_temp.expect_error('select public.review_test_item(current_setting(''test.case'')::uuid,null,''APPROVE'','''',null,null,null)','42501','member cannot approve test');
select pg_temp.expect_error('select public.review_test_item(current_setting(''test.case'')::uuid,null,''REJECT'','''',null,null,null)','42501','member cannot reject test');
select pg_temp.expect_error('select public.review_test_item(current_setting(''test.case'')::uuid,null,''EDIT'','''',repeat('' '',160)||''T'',''Valid'',''Valid'')','23514','padded review title rejected');
select pg_temp.expect_error('select public.review_test_item(current_setting(''test.case'')::uuid,null,''EDIT'','''',''Valid'',repeat('' '',4000)||''T'',''Valid'')','23514','padded review objective rejected');
select pg_temp.expect_error('select public.review_test_item(current_setting(''test.case'')::uuid,null,''EDIT'','''',''Valid'',''Valid'',repeat('' '',4000)||''T'')','23514','padded review expectation rejected');
select set_config('test.case_review',public.review_test_item(current_setting('test.case')::uuid,null,'EDIT','',' Normalized title ',' Normalized objective ',' Normalized expectation ')::text,true);
select pg_temp.assert_true((select title='Normalized title' and objective='Normalized objective' and expected_behavior='Normalized expectation' and actor_id=auth.uid() and decision='EDIT' from public.test_reviews where id=current_setting('test.case_review')::uuid),'member edit normalized with caller attribution');
select pg_temp.assert_true((select definition->>'title'='Bounded planning fixture' from public.test_items where id=current_setting('test.case')::uuid),'generated original remains immutable');
select pg_temp.expect_error('select public.add_human_test_item(current_setting(''test.plan'')::uuid,pg_temp.test_definition())','23514','manual cannot forge deterministic origin');
select set_config('test.human',public.add_human_test_item(current_setting('test.plan')::uuid,pg_temp.test_definition()||'{"origin":"HUMAN_AUTHORED","derivationType":"HUMAN","confidence":"SUPPORTED","logicalKey":"human-scenario"}')::text,true);
select public.add_human_test_item(current_setting('test.plan')::uuid,pg_temp.test_definition('CASE')||'{"origin":"HUMAN_AUTHORED","derivationType":"HUMAN","confidence":"SUPPORTED","logicalKey":"human-case","scenarioKey":"human-scenario"}');
select pg_temp.assert_true((select count(*)=2 from public.test_audit_events where event like 'HUMAN_%'),'manual scenario/case audit');
select pg_temp.expect_error('select public.add_human_test_item(current_setting(''test.plan'')::uuid,pg_temp.test_definition()||''{"origin":"HUMAN_AUTHORED","derivationType":"HUMAN","confidence":"SUPPORTED","logicalKey":"human-executable","executable":true}'')','23514','manual cannot claim executable inference');
select pg_temp.expect_error('update public.test_items set definition=''{}''','42501','direct test definition updates denied');
select pg_temp.expect_error('delete from public.test_reviews','42501','append-only review deletion denied');
reset role;
update public.workspace_members set role='ADMIN' where workspace_id=current_setting('test.g_wa')::uuid and user_id='14000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('test.case_review',public.review_test_item(current_setting('test.case')::uuid,current_setting('test.case_review')::uuid,'APPROVE','',null,null,null)::text,true);
select pg_temp.assert_true((select decision='APPROVE' and revision=2 from public.test_reviews where id=current_setting('test.case_review')::uuid),'admin approves edited case explicitly');
reset role;
delete from public.workspace_members where workspace_id=current_setting('test.g_wa')::uuid and user_id='14000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.expect_error('select pg_temp.save_plan(pg_temp.plan_payload())','42501','cross tenant plan creation denied');
select pg_temp.expect_error('select public.review_test_item(current_setting(''test.case'')::uuid,current_setting(''test.case_review'')::uuid,''EDIT'','''',''X'',''X'',''X'')','42501','cross tenant review denied');
select pg_temp.assert_true((select count(*)=0 from public.test_plans),'plan read RLS');
select pg_temp.assert_true((select count(*)=0 from public.test_items),'item read RLS');
select pg_temp.assert_true((select count(*)=0 from public.test_item_qa_links),'QA link read RLS');
select pg_temp.assert_true((select count(*)=0 from public.test_item_nodes),'node read RLS');
select pg_temp.assert_true((select count(*)=0 from public.test_item_edges),'edge read RLS');
select pg_temp.assert_true((select count(*)=0 from public.test_reviews),'review read RLS');
select pg_temp.assert_true((select count(*)=0 from public.test_requirement_versions),'version read RLS');
select pg_temp.assert_true((select count(*)=0 from public.test_audit_events),'audit read RLS');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error('select pg_temp.save_plan(pg_temp.plan_payload())','42501','anonymous plan creation denied');
reset role;
select pg_temp.assert_true((select bool_and(relrowsecurity) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname like 'test_%'),'all planning tables have RLS');
select pg_temp.assert_true((select bool_and(not has_table_privilege('authenticated',oid,'INSERT') and not has_table_privilege('authenticated',oid,'UPDATE') and not has_table_privilege('authenticated',oid,'DELETE')) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname like 'test_%'),'all planning direct writes denied');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.test_insert_item(uuid,jsonb,uuid,boolean)','EXECUTE'),'private insertion helper revoked');
select pg_temp.assert_true(not has_function_privilege('anon','public.create_test_plan(uuid,jsonb)','EXECUTE'),'anonymous execute revoked');
select pg_temp.assert_true((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in ('public.create_test_plan(uuid,jsonb)'::regprocedure,'public.review_test_item(uuid,uuid,text,text,text,text,text)'::regprocedure,'public.add_human_test_item(uuid,jsonb)'::regprocedure)),'privileged functions safe search path');
select pg_temp.expect_error('insert into public.test_item_nodes select item_id,plan_id,qa_analysis_id,workspace_id,current_setting(''test.g_second'')::uuid,api_import_id,project_id,''forged'' from public.test_item_nodes limit 1','23503','independent graph scope foreign key');
select pg_temp.expect_error('update public.test_item_qa_links set qa_analysis_id=current_setting(''test.qa_second'')::uuid where item_id=(select id from public.test_items limit 1)','23503','independent analysis foreign key');
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{items,1,input,pointer}'',''"#/invented"''))','23514','symbolic input pointer validated');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{items,1,riskRefs}'',jsonb_build_array((select id::text from public.qa_items where analysis_id=current_setting(''test.qa_second'')::uuid and kind=''RISK''))))','23503','cross analysis risk rejected');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{items,1,requirementRefs}'',jsonb_build_array((select id::text from public.qa_items where analysis_id=current_setting(''test.qa_second'')::uuid and kind=''REQUIREMENT''))))','23514','cross analysis requirement rejected');
select pg_temp.expect_error('select pg_temp.save_plan(pg_temp.plan_payload()||jsonb_build_object(''extra'',repeat(''X'',4194304)))','23514','total plan payload bounded');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.plan_payload(),''{items,1,preconditions}'',''[{}]''))','23514','missing precondition shape rejected');
select set_config('test.qa_approval',public.review_qa_item(current_setting('test.req')::uuid,null,'APPROVE','',null,null)::text,true);
select pg_temp.expect_error('select pg_temp.save_plan(pg_temp.plan_payload())','40001','changed requirement review refuses stale planning');
select pg_temp.assert_true((select bool_and(status='PROPOSED') from public.test_requirement_versions),'existing pinned versions unchanged after source approval');
select set_config('test.approved_plan',pg_temp.save_plan(jsonb_set(jsonb_set(pg_temp.plan_payload(),'{requirements,0,status}','"APPROVED"'),'{requirements,0,reviewId}',to_jsonb(current_setting('test.qa_approval'))))::text,true);
select pg_temp.assert_true((select status='APPROVED' and review_id=current_setting('test.qa_approval')::uuid from public.test_requirement_versions where plan_id=current_setting('test.approved_plan')::uuid),'new snapshot pins approved requirement review');
reset role;

set local role authenticated;
-- Direct authenticated RPC regressions for the three undeployed-migration blockers.
create function pg_temp.current_plan_payload(analysis uuid,origin text default 'DETERMINISTIC',derivation text default 'DETERMINISTIC_INFERENCE',candidate boolean default false) returns jsonb language sql as $$
 select pg_temp.plan_payload() || jsonb_build_object('analysisId',analysis,'graphId',a.behaviour_graph_id,
 'requirements',(select jsonb_agg(jsonb_build_object('id',q.id,'reviewId',r.id,'status',case r.decision when 'APPROVE' then 'APPROVED' when 'REJECT' then 'REJECTED' else 'PROPOSED' end,'title',coalesce(e.title,q.title),'statement',coalesce(e.statement,q.statement))) from public.qa_items q left join lateral(select * from public.qa_reviews where item_id=q.id order by revision desc limit 1) r on true left join lateral(select * from public.qa_reviews where item_id=q.id and decision='EDIT' order by revision desc limit 1)e on true where q.analysis_id=a.id and q.kind='REQUIREMENT'),
 'items',jsonb_build_array(pg_temp.test_definition()||p,pg_temp.test_definition('CASE')||p||jsonb_build_object('executable',candidate)))
 from public.qa_analyses a cross join lateral(select jsonb_build_object('origin',origin,'derivationType',derivation,'confidence',case when origin='DETERMINISTIC' then 'EXACT' else 'SUPPORTED' end,'riskRefs','[]'::jsonb,'requirementRefs',(select jsonb_agg(id::text) from public.qa_items where analysis_id=a.id and kind='REQUIREMENT'))p)x where a.id=analysis;
$$;
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.current_plan_payload(current_setting(''test.qa_first'')::uuid),''{items,1,expectedBehavior}'',to_jsonb(repeat('' '',4000)||''X'')))','23514','raw generated expectation remains bounded');
select pg_temp.expect_error('select pg_temp.save_plan(jsonb_set(pg_temp.current_plan_payload(current_setting(''test.qa_first'')::uuid),''{items,1,reason}'',to_jsonb(repeat('' '',2000)||''X'')))','23514','raw generated reason remains bounded');
select pg_temp.expect_error('select public.add_human_test_item(current_setting(''test.plan'')::uuid,pg_temp.test_definition()||jsonb_build_object(''origin'',''HUMAN_AUTHORED'',''derivationType'',''HUMAN'',''confidence'',''SUPPORTED'',''expectedBehavior'',repeat('' '',4000)||''X''))','23514','raw manual expectation remains bounded');
select pg_temp.expect_error('select public.add_human_test_item(current_setting(''test.plan'')::uuid,pg_temp.test_definition()||jsonb_build_object(''origin'',''HUMAN_AUTHORED'',''derivationType'',''HUMAN'',''confidence'',''SUPPORTED'',''reason'',repeat('' '',2000)||''X''))','23514','raw manual reason remains bounded');
select pg_temp.expect_error('select public.create_test_plan(current_setting(''test.qa_second'')::uuid,pg_temp.current_plan_payload(current_setting(''test.qa_second'')::uuid,''DETERMINISTIC'',''DETERMINISTIC_INFERENCE'',true))','23514','proposed requirement executable bypass blocked');
select set_config('test.eligible',public.create_test_plan(current_setting('test.qa_first')::uuid,pg_temp.current_plan_payload(current_setting('test.qa_first')::uuid,'DETERMINISTIC','DETERMINISTIC_INFERENCE',true))::text,true);
select pg_temp.assert_true((select definition->'executable'='true' from public.test_items where plan_id=current_setting('test.eligible')::uuid and kind='CASE'),'approved deterministic candidate accepted');
select set_config('test.ai_analysis',pg_temp.save_qa(pg_temp.qa_payload()||jsonb_build_object('aiStatus','SUCCEEDED','aiMetadata',jsonb_build_object('provider','fixture','model','fixture','promptVersion','fixture','analysisVersion','1','completedAt','2026-10-07T00:00:00Z','inputEvidence','[]'::jsonb,'validated',true),'items',jsonb_build_array(pg_temp.qa_proposal()||'{"sourceKind":"AI_PROPOSED","derivationType":"AI_INFERENCE","confidence":"SUPPORTED"}')))::text,true);
select public.review_qa_item((select id from public.qa_items where analysis_id=current_setting('test.ai_analysis')::uuid),null,'APPROVE','',null,null);
select pg_temp.expect_error('select public.create_test_plan(current_setting(''test.ai_analysis'')::uuid,pg_temp.current_plan_payload(current_setting(''test.ai_analysis'')::uuid,''DETERMINISTIC'',''DETERMINISTIC_INFERENCE'',true))','23514','approved AI requirement executable laundering blocked');
select pg_temp.expect_error('select public.create_test_plan(current_setting(''test.ai_analysis'')::uuid,pg_temp.current_plan_payload(current_setting(''test.ai_analysis'')::uuid))','23514','AI source deterministic origin laundering blocked even non executable');
select set_config('test.ai_plan',public.create_test_plan(current_setting('test.ai_analysis')::uuid,pg_temp.current_plan_payload(current_setting('test.ai_analysis')::uuid,'AI_PROPOSED','AI_INFERENCE'))::text,true);
select pg_temp.assert_true((select bool_and(origin='AI_PROPOSED' and definition->'executable'='false') from public.test_items where plan_id=current_setting('test.ai_plan')::uuid),'source derived AI review planning does not require a new AI call');
select pg_temp.expect_error('select public.create_test_plan(current_setting(''test.ai_analysis'')::uuid,pg_temp.current_plan_payload(current_setting(''test.ai_analysis'')::uuid,''AI_PROPOSED'',''AI_INFERENCE'',true))','23514','AI planning executable flag rejected');
select set_config('test.human_req',public.add_human_qa_item(current_setting('test.qa_second')::uuid,pg_temp.qa_proposal()||'{"logicalKey":"human-source","sourceKind":"HUMAN_AUTHORED","derivationType":"HUMAN","confidence":"SUPPORTED"}')::text,true);
-- Mixed source plan: deterministic first requirement plus human second requirement.
create function pg_temp.mixed_human_payload() returns jsonb language sql as $$
 select pg_temp.current_plan_payload(current_setting('test.qa_second')::uuid)||jsonb_build_object('items',jsonb_build_array(pg_temp.test_definition()||jsonb_build_object('requirementRefs',jsonb_build_array(q.id),'riskRefs','[]'::jsonb),pg_temp.test_definition()||jsonb_build_object('logicalKey','human-source-scenario','origin','HUMAN_AUTHORED','derivationType','HUMAN_SOURCE','confidence','SUPPORTED','requirementRefs',jsonb_build_array(current_setting('test.human_req')),'riskRefs','[]'::jsonb),pg_temp.test_definition('CASE')||jsonb_build_object('logicalKey','human-source-case','scenarioKey','human-source-scenario','origin','HUMAN_AUTHORED','derivationType','HUMAN_SOURCE','confidence','SUPPORTED','requirementRefs',jsonb_build_array(current_setting('test.human_req')),'riskRefs','[]'::jsonb))) from public.qa_items q where q.analysis_id=current_setting('test.qa_second')::uuid and q.source_kind='SPEC_EXPLICIT' and q.kind='REQUIREMENT';
$$;
select set_config('test.human_plan',public.create_test_plan(current_setting('test.qa_second')::uuid,pg_temp.mixed_human_payload())::text,true);
select pg_temp.assert_true((select count(*)=3 from public.test_items where plan_id=current_setting('test.human_plan')::uuid),'proposed human source mixed plan succeeds');
select pg_temp.assert_true((select bool_and(definition->>'derivationType'='HUMAN_SOURCE' and definition->'executable'='false') from public.test_items where plan_id=current_setting('test.human_plan')::uuid and origin='HUMAN_AUTHORED'),'planner human source distinction preserved');
select pg_temp.assert_true((select count(*)=0 from public.test_reviews where plan_id=current_setting('test.human_plan')::uuid),'human generated items do not self approve');
select pg_temp.assert_true((select count(*)=2 from public.test_item_qa_links where plan_id=current_setting('test.human_plan')::uuid and qa_item_id=current_setting('test.human_req')::uuid),'human requirement traceability preserved');
select public.review_qa_item(current_setting('test.human_req')::uuid,null,'APPROVE','',null,null);
select set_config('test.human_approved',public.create_test_plan(current_setting('test.qa_second')::uuid,pg_temp.mixed_human_payload())::text,true);
select pg_temp.assert_true((select source_kind='HUMAN_AUTHORED' and status='APPROVED' and not has_edits from public.test_requirement_versions where plan_id=current_setting('test.human_approved')::uuid and requirement_id=current_setting('test.human_req')::uuid),'approved human source snapshot succeeds');
select pg_temp.expect_error('select public.create_test_plan(current_setting(''test.qa_second'')::uuid,pg_temp.current_plan_payload(current_setting(''test.qa_second'')::uuid,''DETERMINISTIC'',''DETERMINISTIC_INFERENCE'',true))','23514','approved human executable laundering blocked');
select pg_temp.expect_error('select public.create_test_plan(current_setting(''test.qa_second'')::uuid,pg_temp.current_plan_payload(current_setting(''test.qa_second'')::uuid))','23514','human deterministic origin laundering blocked even non executable');
select pg_temp.expect_error('select public.create_test_plan(current_setting(''test.qa_second'')::uuid,jsonb_set(pg_temp.mixed_human_payload(),''{items,2,executable}'',''true''))','23514','human source executable flag rejected');
select pg_temp.expect_error('select public.create_test_plan(current_setting(''test.qa_second'')::uuid,jsonb_set(pg_temp.mixed_human_payload(),''{items,2,nodeRefs}'',''["missing"]''))','23503','mixed human plan late failure remains atomic');
select public.review_qa_item(current_setting('test.human_req')::uuid,(select id from public.qa_reviews where item_id=current_setting('test.human_req')::uuid order by revision desc limit 1),'EDIT','','Edited human intent','Edited human statement');
select set_config('test.human_edited',public.create_test_plan(current_setting('test.qa_second')::uuid,pg_temp.mixed_human_payload())::text,true);
select pg_temp.assert_true((select source_kind='HUMAN_AUTHORED' and has_edits and status='PROPOSED' from public.test_requirement_versions where plan_id=current_setting('test.human_edited')::uuid and requirement_id=current_setting('test.human_req')::uuid),'edited human source persists without laundering');
select public.review_qa_item(current_setting('test.req')::uuid,current_setting('test.qa_approval')::uuid,'EDIT','','Edited deterministic intent','Edited deterministic statement');
select public.review_qa_item(current_setting('test.req')::uuid,(select id from public.qa_reviews where item_id=current_setting('test.req')::uuid order by revision desc limit 1),'APPROVE','',null,null);
select public.review_qa_item(current_setting('test.human_req')::uuid,(select id from public.qa_reviews where item_id=current_setting('test.human_req')::uuid order by revision desc limit 1),'APPROVE','',null,null);
select set_config('test.human_reapproved',public.create_test_plan(current_setting('test.qa_second')::uuid,pg_temp.mixed_human_payload())::text,true);
select pg_temp.assert_true((select has_edits and status='APPROVED' and source_kind='HUMAN_AUTHORED' from public.test_requirement_versions where plan_id=current_setting('test.human_reapproved')::uuid and requirement_id=current_setting('test.human_req')::uuid),'reapproved edited human source remains review only');
select pg_temp.expect_error('select public.create_test_plan(current_setting(''test.qa_first'')::uuid,pg_temp.current_plan_payload(current_setting(''test.qa_first'')::uuid,''DETERMINISTIC'',''DETERMINISTIC_INFERENCE'',true))','23514','approved edited requirement executable bypass blocked');
select set_config('test.edited_plan',public.create_test_plan(current_setting('test.qa_first')::uuid,pg_temp.current_plan_payload(current_setting('test.qa_first')::uuid))::text,true);
select pg_temp.assert_true((select source_kind='SPEC_EXPLICIT' and has_edits and status='APPROVED' from public.test_requirement_versions where plan_id=current_setting('test.edited_plan')::uuid),'edited approved source remains pinned review only');
select public.review_qa_item(current_setting('test.req')::uuid,(select id from public.qa_reviews where item_id=current_setting('test.req')::uuid order by revision desc limit 1),'REJECT','',null,null);
select pg_temp.expect_error('select public.create_test_plan(current_setting(''test.qa_first'')::uuid,pg_temp.current_plan_payload(current_setting(''test.qa_first'')::uuid))','23514','rejected requirement cannot support active planning');
select pg_temp.assert_true((select status='APPROVED' and not has_edits from public.test_requirement_versions where plan_id=current_setting('test.eligible')::uuid),'later edits and rejection do not rewrite historical source snapshot');
-- Use AI source review-only plan for dependency checks; dependency validity is independent of eligibility.
create function pg_temp.dependency_item(reference jsonb,edges jsonb default null) returns jsonb language sql as $$
 select pg_temp.test_definition()||jsonb_build_object('logicalKey','dependency-'||coalesce(reference::text,'null'),'origin','HUMAN_AUTHORED','derivationType','HUMAN','confidence','SUPPORTED','requirementRefs',jsonb_build_array((select id::text from public.qa_items where analysis_id=current_setting('test.ai_analysis')::uuid)),'riskRefs','[]'::jsonb,'nodeRefs',jsonb_build_array('["OPERATION","POST /users"]','["OPERATION","GET /users"]'),'edgeRefs',coalesce(edges,jsonb_build_array(current_setting('test.dependency_edge'))),'preconditions',jsonb_build_array(jsonb_build_object('kind','IDENTIFIER_FROM_OPERATION','reference',reference)));
$$;
select set_config('test.dependency',public.add_human_test_item(current_setting('test.ai_plan')::uuid,pg_temp.dependency_item(to_jsonb(current_setting('test.dependency_edge'))))::text,true);
select pg_temp.assert_true((select count(*)=1 from public.test_item_edges where item_id=current_setting('test.dependency')::uuid and edge_id=current_setting('test.dependency_edge')),'valid pinned graph dependency accepted with relational evidence');
select pg_temp.expect_error('select public.add_human_test_item(current_setting(''test.ai_plan'')::uuid,pg_temp.dependency_item(''null''))','23514','identifier dependency reference is required');
select pg_temp.expect_error('select public.add_human_test_item(current_setting(''test.ai_plan'')::uuid,pg_temp.dependency_item(''"arbitrary"''))','23514','arbitrary identifier reference rejected');
select pg_temp.expect_error('select public.add_human_test_item(current_setting(''test.ai_plan'')::uuid,pg_temp.dependency_item(''"missing"'',''["missing"]''))','23514','nonexistent dependency evidence rejected');
select pg_temp.expect_error('select public.add_human_test_item(current_setting(''test.ai_plan'')::uuid,pg_temp.dependency_item(to_jsonb(current_setting(''test.dependency_edge'')),''[]''))','23514','dependency must appear in item edge evidence');
select pg_temp.expect_error('select public.add_human_test_item(current_setting(''test.ai_plan'')::uuid,pg_temp.dependency_item(''"producer"'',''["producer"]''))','23514','node cannot masquerade as dependency edge');
select pg_temp.expect_error('select public.add_human_test_item(current_setting(''test.ai_plan'')::uuid,pg_temp.dependency_item(to_jsonb((select logical_id from public.behaviour_graph_edges where graph_id=current_setting(''test.g_first'')::uuid and type=''API_HAS_OPERATION'')),jsonb_build_array((select logical_id from public.behaviour_graph_edges where graph_id=current_setting(''test.g_first'')::uuid and type=''API_HAS_OPERATION''))))','23514','wrong edge semantic type rejected');
select pg_temp.expect_error('select public.add_human_test_item(current_setting(''test.ai_plan'')::uuid,jsonb_set(pg_temp.dependency_item(to_jsonb(current_setting(''test.dependency_edge''))),''{nodeRefs}'',''["producer"]''))','23514','dependency endpoint evidence required');
select set_config('test.before_failure',(select count(*)::text from public.test_plans),true);
select pg_temp.expect_error('select public.create_test_plan(current_setting(''test.ai_analysis'')::uuid,jsonb_set(pg_temp.current_plan_payload(current_setting(''test.ai_analysis'')::uuid,''AI_PROPOSED'',''AI_INFERENCE''),''{items,1,preconditions}'',''[{"kind":"IDENTIFIER_FROM_OPERATION","reference":null}]''))','23514','normal creation RPC rejects invalid identifier provenance');
select pg_temp.assert_true((select count(*)::text=current_setting('test.before_failure') from public.test_plans),'invalid dependency creation leaves no partial plan');
select set_config('test.foreign_graph',pg_temp.save_fixture(replace(pg_temp.fixture_graph()::text,'POST /users','POST /foreign-graph')::jsonb)::text,true);
select pg_temp.expect_error('select public.add_human_test_item(current_setting(''test.ai_plan'')::uuid,pg_temp.dependency_item(to_jsonb(''["OPERATION_PRECEDES_OPERATION","[\"OPERATION\",\"POST /foreign-graph\"]","[\"OPERATION\",\"GET /users\"]"]''::text),jsonb_build_array(''["OPERATION_PRECEDES_OPERATION","[\"OPERATION\",\"POST /foreign-graph\"]","[\"OPERATION\",\"GET /users\"]"]'')))','23514','other graph dependency rejected');
select set_config('test.foreign_project_graph',public.build_behaviour_graph(current_setting('test.g_wa')::uuid,current_setting('test.g_pa2')::uuid,current_setting('test.g_import2')::uuid,replace(replace(replace(replace(pg_temp.fixture_graph()::text,'POST /users','POST /foreign-project')::jsonb::text,current_setting('test.g_pa'),current_setting('test.g_pa2')),current_setting('test.g_import'),current_setting('test.g_import2')),'unused','unused')::jsonb)::text,true);
select pg_temp.expect_error('select public.add_human_test_item(current_setting(''test.ai_plan'')::uuid,pg_temp.dependency_item(to_jsonb(''["OPERATION_PRECEDES_OPERATION","[\"OPERATION\",\"POST /foreign-project\"]","[\"OPERATION\",\"GET /users\"]"]''::text),jsonb_build_array(''["OPERATION_PRECEDES_OPERATION","[\"OPERATION\",\"POST /foreign-project\"]","[\"OPERATION\",\"GET /users\"]"]'')))','23514','other project dependency rejected');
select set_config('test.foreign_workspace',public.create_workspace('Disposable dependency tenant B')::text,true);
select set_config('test.foreign_project',public.create_project(current_setting('test.foreign_workspace')::uuid,'Disposable dependency project B')::text,true);
select set_config('test.foreign_import',public.import_api_spec(current_setting('test.foreign_workspace')::uuid,current_setting('test.foreign_project')::uuid,'json',null,100,repeat('a',64),'{"info":{}}','{"modelVersion":1,"title":"SQL fixture","version":"1","openapiVersion":"3.0.3","operations":[],"components":{}}')::text,true);
select public.build_behaviour_graph(current_setting('test.foreign_workspace')::uuid,current_setting('test.foreign_project')::uuid,current_setting('test.foreign_import')::uuid,replace(replace(replace(replace(pg_temp.fixture_graph()::text,'POST /users','POST /foreign-tenant')::jsonb::text,current_setting('test.g_wa'),current_setting('test.foreign_workspace')),current_setting('test.g_pa'),current_setting('test.foreign_project')),current_setting('test.g_import'),current_setting('test.foreign_import'))::jsonb);
select pg_temp.expect_error('select public.add_human_test_item(current_setting(''test.ai_plan'')::uuid,pg_temp.dependency_item(to_jsonb(''["OPERATION_PRECEDES_OPERATION","[\"OPERATION\",\"POST /foreign-tenant\"]","[\"OPERATION\",\"GET /users\"]"]''::text),jsonb_build_array(''["OPERATION_PRECEDES_OPERATION","[\"OPERATION\",\"POST /foreign-tenant\"]","[\"OPERATION\",\"GET /users\"]"]'')))','23514','other tenant dependency rejected');
reset role;

select count(*) as m16_assertions_passed from pg_temp.qa_results;
rollback;
