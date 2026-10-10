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
    'nodes',jsonb_build_array(jsonb_build_object('id','["API","root"]','type','API','label','SQL fixture','provenance',p),jsonb_build_object('id','["OPERATION","GET /users"]','type','OPERATION','label','GET /users','provenance',p)),
    'edges',jsonb_build_array(jsonb_build_object('id','["API_HAS_OPERATION","[\"API\",\"root\"]","[\"OPERATION\",\"GET /users\"]"]','type','API_HAS_OPERATION','from','["API","root"]','to','["OPERATION","GET /users"]','provenance',p)))
  from (select jsonb_build_object('importId',current_setting('test.g_import'),'ruleId','DECLARED_STRUCTURE','sourcePointers',jsonb_build_array('#/info'),'derivation','EXPLICIT','confidence','EXACT','evidence',jsonb_build_array('SQL development fixture')) p) x;
$$;
create function pg_temp.save_fixture(payload jsonb) returns uuid language sql as $$ select public.build_behaviour_graph(current_setting('test.g_wa')::uuid,current_setting('test.g_pa')::uuid,current_setting('test.g_import')::uuid,payload); $$;
select set_config('test.g_first',pg_temp.save_fixture(pg_temp.fixture_graph())::text,true);
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
select pg_temp.assert_true(current_setting('test.qa_first')<>current_setting('test.qa_second'),'analysis rerun creates a new snapshot');
select pg_temp.assert_true((select count(*)=2 from public.qa_analyses),'complete analysis headers');
select pg_temp.assert_true((select count(*)=4 from public.qa_items),'all requirements and risks persisted');
select pg_temp.assert_true((select count(*)=4 from public.qa_item_nodes),'all node evidence persisted');
select pg_temp.assert_true((select count(*)=2 from public.qa_item_requirements),'risk to requirement links persisted');
select pg_temp.assert_true((select bool_and(created_by=auth.uid()) from public.qa_items),'creator derived from authenticated caller');
select pg_temp.assert_true((select count(*)=2 from public.qa_audit_events where event='ANALYSIS_CREATED'),'analysis creation audited');
select pg_temp.expect_error('select pg_temp.save_qa(pg_temp.qa_payload()||''{"workspaceId":"15000000-0000-0000-0000-000000000099"}'')','23514','payload scope forgery rejected');
select pg_temp.expect_error('select pg_temp.save_qa(pg_temp.qa_payload()||''{"status":"APPROVED"}'')','23514','caller cannot approve generated analysis');
select pg_temp.expect_error('select pg_temp.save_qa(jsonb_set(pg_temp.qa_payload(),''{items,1,nodeRefs}'',''["unknown-node"]''))','23503','late node failure rolls back');
select pg_temp.expect_error('select pg_temp.save_qa(jsonb_set(pg_temp.qa_payload(),''{items,1,edgeRefs}'',''["unknown-edge"]''))','23503','late edge failure rolls back');
select pg_temp.expect_error('select pg_temp.save_qa(jsonb_set(pg_temp.qa_payload(),''{items,1,requirementRefs}'',''["unknown-requirement"]''))','23514','missing requirement rejected');
select pg_temp.expect_error('select pg_temp.save_qa(jsonb_set(pg_temp.qa_payload(),''{items,1,sourcePointers}'',''["#/missing"]''))','23514','broken source pointer rejected');
select pg_temp.expect_error('select pg_temp.save_qa(jsonb_set(pg_temp.qa_payload(),''{items,1,severity}'',''null''))','23514','risk severity required');
select pg_temp.expect_error('select pg_temp.save_qa(jsonb_set(pg_temp.qa_payload(),''{items,1,logicalKey}'',''"REQUIREMENT"''))','23505','duplicate identity rejected');
select pg_temp.expect_error('select pg_temp.save_qa(jsonb_set(pg_temp.qa_payload(),''{items,0,title}'',''{}''))','23514','structured text cannot masquerade as title');
select pg_temp.expect_error('select pg_temp.save_qa(pg_temp.qa_payload()||''{"aiStatus":"SUCCEEDED","aiMetadata":{"provider":"fixture","model":"fixture","promptVersion":"1.0.0","analysisVersion":"1.0.0","completedAt":"2026-10-06T00:00:00Z","inputEvidence":[]}}'')','23514','validated AI marker mandatory');
select pg_temp.expect_error('select public.create_qa_analysis(current_setting(''test.g_wa'')::uuid,current_setting(''test.g_pa2'')::uuid,current_setting(''test.g_import'')::uuid,current_setting(''test.g_first'')::uuid,pg_temp.qa_payload())','42501','cross project graph rejected');
select pg_temp.assert_true((select count(*)=2 from public.qa_analyses),'failed saves leave no partial analysis');
select pg_temp.assert_true((select count(*)=4 from public.qa_items),'failed saves leave no partial items');
select pg_temp.assert_true((select count(*)=2 from public.qa_audit_events),'failed saves leave no audit residue');
select set_config('test.qa_item',(select id::text from public.qa_items where analysis_id=current_setting('test.qa_first')::uuid and kind='REQUIREMENT'),true);
select set_config('test.qa_review',public.review_qa_item(current_setting('test.qa_item')::uuid,null,'APPROVE','Reviewed declared contract',null,null)::text,true);
select pg_temp.expect_error('select public.review_qa_item(current_setting(''test.qa_item'')::uuid,null,''REJECT'',''stale'',null,null)','40001','stale review decision rejected');
select set_config('test.qa_review',public.review_qa_item(current_setting('test.qa_item')::uuid,current_setting('test.qa_review')::uuid,'REJECT','Needs clarification',null,null)::text,true);
select pg_temp.expect_error('select public.review_qa_item(current_setting(''test.qa_item'')::uuid,current_setting(''test.qa_review'')::uuid,''EDIT'',''invalid'',null,null)','23514','edit requires revised content');
reset role;
insert into public.workspace_members(workspace_id,user_id,role) values(current_setting('test.g_wa')::uuid,'14000000-0000-0000-0000-000000000002','MEMBER');
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000002',true);
select pg_temp.expect_error('select public.review_qa_item(current_setting(''test.qa_item'')::uuid,current_setting(''test.qa_review'')::uuid,''APPROVE'','''',null,null)','42501','member cannot approve');
select pg_temp.expect_error('select public.review_qa_item(current_setting(''test.qa_item'')::uuid,current_setting(''test.qa_review'')::uuid,''REJECT'','''',null,null)','42501','member cannot reject');
select set_config('test.qa_review',public.review_qa_item(current_setting('test.qa_item')::uuid,current_setting('test.qa_review')::uuid,'EDIT','Human clarification','Revised human title','Revised human statement')::text,true);
select pg_temp.assert_true((select title='Declared fixture contract' from public.qa_items where id=current_setting('test.qa_item')::uuid),'human edit preserves generated original');
select pg_temp.assert_true((select count(*)=3 from public.qa_reviews),'append-only review history');
select pg_temp.assert_true((select decision='EDIT' and actor_id=auth.uid() from public.qa_reviews where id=current_setting('test.qa_review')::uuid),'member edit actor and decision recorded');
select pg_temp.assert_true((select count(*)=3 from public.qa_audit_events where item_id=current_setting('test.qa_item')::uuid),'every review audited');

-- Direct RPC callers cannot hide oversized raw edits behind surrounding spaces.
select set_config('test.qa_risk',(select id::text from public.qa_items where analysis_id=current_setting('test.qa_first')::uuid and kind='RISK'),true);
do $$
declare kind text;field text;side text;size integer;item uuid;expected uuid;t text;s text;
begin
 foreach kind in array array['REQUIREMENT','RISK'] loop
  item:=case when kind='REQUIREMENT' then current_setting('test.qa_item')::uuid else current_setting('test.qa_risk')::uuid end;
  expected:=case when kind='REQUIREMENT' then current_setting('test.qa_review')::uuid else null end;
  foreach field in array array['title','statement'] loop
   foreach side in array array['leading','trailing'] loop
    foreach size in array array[case when field='title' then 161 else 4001 end,1000000] loop
     t:='Valid title';s:='Valid statement';
     if field='title' then t:=case when side='leading' then repeat(' ',size-1)||'T' else 'T'||repeat(' ',size-1) end;
     else s:=case when side='leading' then repeat(' ',size-1)||'S' else 'S'||repeat(' ',size-1) end;end if;
     perform pg_temp.expect_error(format('select public.review_qa_item(%L::uuid,%L::uuid,''EDIT'','''',%L,%L)',item,expected,t,s),'23514',format('%s %s %s raw bound %s',kind,field,side,size));
    end loop;
   end loop;
  end loop;
 end loop;
end;$$;
select pg_temp.expect_error('select public.review_qa_item(current_setting(''test.qa_item'')::uuid,current_setting(''test.qa_review'')::uuid,''EDIT'','''',''   '',''Valid'')','23514','blank trimmed title rejected');
select pg_temp.expect_error('select public.review_qa_item(current_setting(''test.qa_item'')::uuid,current_setting(''test.qa_review'')::uuid,''EDIT'','''',''Valid'',''   '')','23514','blank trimmed statement rejected');
select pg_temp.expect_error('select public.review_qa_item(current_setting(''test.qa_item'')::uuid,current_setting(''test.qa_review'')::uuid,''EDIT'',repeat(''R'',2001),''Valid'',''Valid'')','23514','raw rationale bounded');
select pg_temp.expect_error('select public.review_qa_item(current_setting(''test.qa_item'')::uuid,current_setting(''test.qa_review'')::uuid,repeat(''X'',32769),'''',null,null)','23514','total RPC text payload bounded');
select pg_temp.assert_true((select count(*)=3 from public.qa_reviews) and (select count(*)=3 from public.qa_audit_events where item_id=current_setting('test.qa_item')::uuid),'failed edits leave no review or audit residue');
select set_config('test.qa_review',public.review_qa_item(current_setting('test.qa_item')::uuid,current_setting('test.qa_review')::uuid,'EDIT','','  Normalized requirement  ','  Normalized statement  ')::text,true);
select pg_temp.assert_true((select title='Normalized requirement' and statement='Normalized statement' and revision=4 and actor_id=auth.uid() from public.qa_reviews where id=current_setting('test.qa_review')::uuid),'member requirement edit normalized and appended');
select set_config('test.qa_risk_review',public.review_qa_item(current_setting('test.qa_risk')::uuid,null,'EDIT','','  Normalized risk  ','  Normalized risk statement  ')::text,true);
select pg_temp.assert_true((select title='Normalized risk' and statement='Normalized risk statement' and revision=1 and actor_id=auth.uid() from public.qa_reviews where id=current_setting('test.qa_risk_review')::uuid),'member risk edit normalized and appended');
select set_config('test.qa_risk_review',public.review_qa_item(current_setting('test.qa_risk')::uuid,current_setting('test.qa_risk_review')::uuid,'EDIT',repeat('R',2000),repeat('T',160),repeat('S',4000))::text,true);
select pg_temp.assert_true((select length(title)=160 and length(statement)=4000 and length(rationale)=2000 from public.qa_reviews where id=current_setting('test.qa_risk_review')::uuid),'inclusive raw field limits accepted');
reset role;
update public.workspace_members set role='ADMIN' where workspace_id=current_setting('test.g_wa')::uuid and user_id='14000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('test.qa_risk_review',public.review_qa_item(current_setting('test.qa_risk')::uuid,current_setting('test.qa_risk_review')::uuid,'APPROVE','',null,null)::text,true);
select pg_temp.assert_true((select decision='APPROVE' and title is null and statement is null and actor_id=auth.uid() from public.qa_reviews where id=current_setting('test.qa_risk_review')::uuid),'admin approves without edit content');
select set_config('test.qa_risk_review',public.review_qa_item(current_setting('test.qa_risk')::uuid,current_setting('test.qa_risk_review')::uuid,'REJECT','',null,null)::text,true);
select pg_temp.assert_true((select decision='REJECT' and title is null and statement is null from public.qa_reviews where id=current_setting('test.qa_risk_review')::uuid),'admin rejects without edit content');
select set_config('test.qa_risk_review',public.review_qa_item(current_setting('test.qa_risk')::uuid,current_setting('test.qa_risk_review')::uuid,'EDIT','','Admin title','Admin statement')::text,true);
select pg_temp.assert_true((select decision='EDIT' and revision=5 from public.qa_reviews where id=current_setting('test.qa_risk_review')::uuid),'admin edit appends proposed revision');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
select set_config('test.qa_review',public.review_qa_item(current_setting('test.qa_item')::uuid,current_setting('test.qa_review')::uuid,'EDIT','','Owner title','Owner statement')::text,true);
select pg_temp.assert_true((select actor_id=auth.uid() and decision='EDIT' and revision=5 from public.qa_reviews where id=current_setting('test.qa_review')::uuid),'owner edit appends caller-derived revision');
select pg_temp.assert_true((select count(*)=2 from public.qa_items where analysis_id=current_setting('test.qa_first')::uuid and title='Declared fixture contract'),'both generated originals immutable after edits');
select pg_temp.assert_true((select count(*)=10 from public.qa_reviews) and (select count(*)=10 from public.qa_audit_events where item_id in (current_setting('test.qa_item')::uuid,current_setting('test.qa_risk')::uuid)),'successful reviews each retain one audit event');
reset role;
update public.workspace_members set role='MEMBER' where workspace_id=current_setting('test.g_wa')::uuid and user_id='14000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000002',true);

select pg_temp.expect_error('select public.add_human_qa_item(current_setting(''test.qa_first'')::uuid,pg_temp.qa_proposal())','23514','human RPC cannot forge specification origin');
select set_config('test.qa_human',public.add_human_qa_item(current_setting('test.qa_first')::uuid,pg_temp.qa_proposal()||'{"logicalKey":"human-requirement","sourceKind":"HUMAN_AUTHORED","derivationType":"HUMAN"}')::text,true);
select pg_temp.assert_true((select source_kind='HUMAN_AUTHORED' from public.qa_items where id=current_setting('test.qa_human')::uuid),'member can add human requirement');
select public.add_human_qa_item(current_setting('test.qa_first')::uuid,pg_temp.qa_proposal('RISK')||'{"logicalKey":"human-risk","sourceKind":"HUMAN_AUTHORED","derivationType":"HUMAN","requirementRefs":[]}');
select pg_temp.assert_true((select count(*)=2 from public.qa_audit_events where event in ('HUMAN_REQUIREMENT_ADDED','HUMAN_RISK_ADDED')),'manual additions audited');
select pg_temp.expect_error('update public.qa_items set title=''forged''','42501','direct original mutation denied');
select pg_temp.expect_error('delete from public.qa_reviews','42501','review deletion denied');
select pg_temp.expect_error('insert into public.qa_analyses(id) values(gen_random_uuid())','42501','direct analysis insert denied');
select pg_temp.expect_error('update public.qa_analyses set engine_version=''9.0.0''','42501','analysis metadata mutation denied');
reset role;
delete from public.workspace_members where workspace_id=current_setting('test.g_wa')::uuid and user_id='14000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.qa_analyses),'cross tenant analysis reads denied');
select pg_temp.assert_true((select count(*)=0 from public.qa_items),'cross tenant item reads denied');
select pg_temp.assert_true((select count(*)=0 from public.qa_item_nodes),'cross tenant node reads denied');
select pg_temp.assert_true((select count(*)=0 from public.qa_item_edges),'cross tenant edge reads denied');
select pg_temp.assert_true((select count(*)=0 from public.qa_item_requirements),'cross tenant requirement links denied');
select pg_temp.assert_true((select count(*)=0 from public.qa_reviews),'cross tenant review reads denied');
select pg_temp.assert_true((select count(*)=0 from public.qa_audit_events),'cross tenant audit reads denied');
select pg_temp.expect_error('select pg_temp.save_qa(pg_temp.qa_payload())','42501','cross tenant analysis denied');
select pg_temp.expect_error('select public.review_qa_item(current_setting(''test.qa_item'')::uuid,current_setting(''test.qa_review'')::uuid,''EDIT'','''',''forged'',''forged'')','42501','cross tenant review denied');
select pg_temp.expect_error('select public.add_human_qa_item(current_setting(''test.qa_first'')::uuid,pg_temp.qa_proposal())','42501','cross tenant manual addition denied');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error('select pg_temp.save_qa(pg_temp.qa_payload())','42501','missing authenticated caller rejected');
reset role;
select pg_temp.assert_true((select bool_and(relrowsecurity) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname like 'qa_%'),'RLS enabled on all intelligence tables');
select pg_temp.assert_true(not has_table_privilege('anon','public.qa_items','SELECT'),'anonymous reads denied');
select pg_temp.assert_true(not has_function_privilege('anon','public.create_qa_analysis(uuid,uuid,uuid,uuid,jsonb)','EXECUTE'),'anonymous analysis denied');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.qa_insert_item(uuid,jsonb,uuid,boolean)','EXECUTE'),'private insertion helper inaccessible');
select pg_temp.assert_true((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in ('public.create_qa_analysis(uuid,uuid,uuid,uuid,jsonb)'::regprocedure,'public.review_qa_item(uuid,uuid,text,text,text,text)'::regprocedure,'public.add_human_qa_item(uuid,jsonb)'::regprocedure)),'all public writers have safe search path');
select pg_temp.expect_error('insert into public.qa_item_nodes select item_id,analysis_id,current_setting(''test.g_second'')::uuid,api_import_id,project_id,workspace_id,''forged'' from public.qa_item_nodes limit 1','23503','independent cross graph item FK');
select pg_temp.expect_error('insert into public.qa_item_requirements(item_id,requirement_id,analysis_id,workspace_id) select r.id,q.id,r.analysis_id,r.workspace_id from public.qa_items r cross join public.qa_items q where r.analysis_id=current_setting(''test.qa_first'')::uuid and r.kind=''RISK'' and q.analysis_id=current_setting(''test.qa_second'')::uuid and q.kind=''REQUIREMENT''','23503','independent cross analysis requirement FK');
select pg_temp.assert_true((select bool_and(not has_table_privilege('authenticated',oid,'INSERT') and not has_table_privilege('authenticated',oid,'UPDATE') and not has_table_privilege('authenticated',oid,'DELETE')) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname like 'qa_%'),'all intelligence tables deny direct writes');
select pg_temp.expect_error('insert into public.qa_reviews(item_id,analysis_id,workspace_id,revision,actor_id,decision,rationale,title,statement) select item_id,analysis_id,workspace_id,100,actor_id,''EDIT'','''',''T''||repeat('' '',160),''Valid'' from public.qa_reviews where id=current_setting(''test.qa_review'')::uuid','23514','table independently rejects padded oversized title');
select pg_temp.expect_error('insert into public.qa_reviews(item_id,analysis_id,workspace_id,revision,actor_id,decision,rationale,title,statement) select item_id,analysis_id,workspace_id,100,actor_id,''EDIT'','''',''Valid'',''S''||repeat('' '',4000) from public.qa_reviews where id=current_setting(''test.qa_review'')::uuid','23514','table independently rejects padded oversized statement');
select count(*) as m15_assertions_passed from pg_temp.qa_results;
rollback;
