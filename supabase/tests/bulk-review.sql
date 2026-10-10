-- Disposable local database only. All fixtures/reviews roll back.
\ir fixtures/bulk-review-source.sql
create function pg_temp.test_batch(p uuid,k text default 'CASE') returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('id',i.id,'expectedReviewId',(select id from public.test_reviews where item_id=i.id order by revision desc limit 1),'title',i.definition->>'title','objective',i.definition->>'objective','expectedBehavior',i.definition->>'expectedBehavior') order by i.id) from public.test_items i where plan_id=p and kind=k;
$$;
select pg_temp.assert_true(public.bulk_review_items('PLANNING',current_setting('test.plan')::uuid,'CASE','EDIT','Clarify these proposals',pg_temp.test_batch(current_setting('test.plan')::uuid))=2,'multiple request changes');
select pg_temp.assert_true((select count(*)=2 and bool_and(decision='EDIT') from public.test_reviews),'revisions individually recorded');
select pg_temp.assert_true(public.bulk_review_items('PLANNING',current_setting('test.plan')::uuid,'CASE','APPROVE','Reviewed',pg_temp.test_batch(current_setting('test.plan')::uuid))=2,'multiple case approvals');
select pg_temp.assert_true((select count(*)=4 from public.test_audit_events where event in ('CASE_EDIT','CASE_APPROVE')),'individual audit events per case');
select pg_temp.assert_true((select bool_and(not (definition->>'executable')::boolean) from public.test_items),'approval does not change executable flags');
select pg_temp.expect_error('select public.bulk_review_items(''PLANNING'',current_setting(''test.plan'')::uuid,''CASE'',''APPROVE'','''',pg_temp.test_batch(current_setting(''test.plan'')::uuid))','40001','already reviewed excluded');
select pg_temp.assert_true(public.bulk_review_items('PLANNING',current_setting('test.plan2')::uuid,'CASE','REJECT','Unsupported expectations',pg_temp.test_batch(current_setting('test.plan2')::uuid))=2,'multiple case rejections');
select public.review_test_item((select id from public.test_items where plan_id=current_setting('test.plan')::uuid and kind='SCENARIO'),null,'APPROVE','Single review remains available',null,null,null);
select pg_temp.assert_true((select count(*)=1 from public.test_reviews where decision='APPROVE' and item_id in(select id from public.test_items where kind='SCENARIO')),'single item review unchanged');

create function pg_temp.add_requirement(a uuid,key text) returns uuid language sql as $$
 select public.add_human_qa_item(a,pg_temp.qa_proposal()||jsonb_build_object('logicalKey',key,'sourceKind','HUMAN_AUTHORED','derivationType','HUMAN','confidence','SUPPORTED','ruleId','HUMAN_PROPOSAL'));
$$;
select set_config('test.req2',pg_temp.add_requirement(current_setting('test.qa_first')::uuid,'HUMAN_BULK')::text,true);
create function pg_temp.qa_batch(a uuid,k text default 'REQUIREMENT') returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('id',i.id,'expectedReviewId',(select id from public.qa_reviews where item_id=i.id order by revision desc limit 1),'title',i.title,'statement',i.statement) order by i.id) from public.qa_items i where analysis_id=a and kind=k;
$$;
select pg_temp.expect_error('select public.bulk_review_items(''QA'',current_setting(''test.qa_first'')::uuid,''REQUIREMENT'',''REJECT'','' '',pg_temp.qa_batch(current_setting(''test.qa_first'')::uuid))','23514','reason required');
select pg_temp.expect_error('select public.bulk_review_items(''QA'',current_setting(''test.qa_first'')::uuid,''REQUIREMENT'',''APPROVE'','''',pg_temp.qa_batch(current_setting(''test.qa_second'')::uuid))','42501','cross analysis rejected');
select pg_temp.expect_error('select public.bulk_review_items(''QA'',current_setting(''test.g_pa2'')::uuid,''REQUIREMENT'',''APPROVE'','''',pg_temp.qa_batch(current_setting(''test.qa_first'')::uuid))','42501','cross project parent rejected');
select set_config('test.stale_batch',pg_temp.qa_batch(current_setting('test.qa_first')::uuid)::text,true);
select pg_temp.assert_true(public.bulk_review_items('QA',current_setting('test.qa_first')::uuid,'REQUIREMENT','EDIT','Request clearer text',pg_temp.qa_batch(current_setting('test.qa_first')::uuid))=2,'bulk requirement revisions');
select pg_temp.expect_error('select public.bulk_review_items(''QA'',current_setting(''test.qa_first'')::uuid,''REQUIREMENT'',''APPROVE'','''',current_setting(''test.stale_batch'')::jsonb)','40001','stale expected revision rejected');
select pg_temp.expect_error('select public.bulk_review_items(''QA'',current_setting(''test.qa_first'')::uuid,''REQUIREMENT'',''APPROVE'','''',jsonb_set(pg_temp.qa_batch(current_setting(''test.qa_first'')::uuid),''{1,expectedReviewId}'',''null''::jsonb))','40001','later stale item rolls back earlier valid item');
select pg_temp.assert_true((select count(*)=2 from public.qa_reviews),'stale batch left no partial reviews');
select pg_temp.assert_true(public.bulk_review_items('QA',current_setting('test.qa_first')::uuid,'REQUIREMENT','APPROVE','Reviewed',pg_temp.qa_batch(current_setting('test.qa_first')::uuid))=2,'approve all pending snapshot');
select pg_temp.assert_true((select count(*)=4 from public.qa_reviews),'individual requirement revisions retained');
select pg_temp.assert_true((select count(*)=4 from public.qa_audit_events where event in ('REQUIREMENT_EDIT','REQUIREMENT_APPROVE')),'individual requirement audit retained');
select pg_temp.assert_true(public.bulk_review_items('QA',current_setting('test.qa_first')::uuid,'RISK','REJECT','Signal is not applicable',pg_temp.qa_batch(current_setting('test.qa_first')::uuid,'RISK'))=1,'risk rejection');
-- Existing plan's pinned QA review no longer matches; no new planning reviews allowed.
select pg_temp.expect_error('select public.bulk_review_items(''PLANNING'',current_setting(''test.plan2'')::uuid,''SCENARIO'',''APPROVE'','''',pg_temp.test_batch(current_setting(''test.plan2'')::uuid,''SCENARIO''))','40001','stale requirement snapshot rejected');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000002',true);
select pg_temp.expect_error('select public.bulk_review_items(''QA'',current_setting(''test.qa_first'')::uuid,''REQUIREMENT'',''APPROVE'','''',jsonb_build_array(jsonb_build_object(''id'',current_setting(''test.req''),''expectedReviewId'',null)))','42501','cross tenant denied');
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.bulk_review_items(text,uuid,text,text,text,jsonb)','EXECUTE'),'anon excluded');
select pg_temp.assert_true(not has_function_privilege('service_role','public.bulk_review_items(text,uuid,text,text,text,jsonb)','EXECUTE'),'service role excluded');
select pg_temp.assert_true(not has_function_privilege('testpilot_runner','public.bulk_review_items(text,uuid,text,text,text,jsonb)','EXECUTE'),'runner not expanded');
select public.validate_execution_runner_role();
select count(*) as bulk_assertions_passed from pg_temp.qa_results;
rollback;
