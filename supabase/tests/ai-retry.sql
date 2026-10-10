-- Disposable local rollback-only fixture. No hosted writes or provider calls.
\ir fixtures/curiosity-source.sql
truncate pg_temp.qa_results;
create function pg_temp.retry_admit(hash text) returns jsonb language sql as $$ select public.admit_ai_reasoning(current_setting('test.g_pa')::uuid,current_setting('test.g_import')::uuid,'PLANNING',current_setting('test.qa_first')::uuid,'gpt-4.1-mini',hash); $$;
create function pg_temp.retry_finish(ticket jsonb,state text,code text) returns uuid language sql as $$ select public.complete_ai_reasoning((ticket->>'id')::uuid,(ticket->>'nonce')::uuid,state,jsonb_build_object('inputTokens',null,'outputTokens',null,'errorCode',code),null); $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
select set_config('retry.first',pg_temp.retry_admit(repeat('a',64))::text,true);
select pg_temp.expect_error('select pg_temp.retry_admit(repeat(''a'',64))','23505','inflight identical request remains protected');
select set_config('retry.plan',public.complete_ai_reasoning((current_setting('retry.first')::jsonb->>'id')::uuid,(current_setting('retry.first')::jsonb->>'nonce')::uuid,'COMPLETED','{"inputTokens":100,"outputTokens":30}',jsonb_set(jsonb_set(pg_temp.plan_payload(),'{requirements,0,status}','"APPROVED"'),'{requirements,0,reviewId}',to_jsonb(current_setting('test.qa_approval')))||jsonb_build_object('aiStatus','SUCCEEDED','aiMetadata',jsonb_build_object('provider','openai','model','gpt-4.1-mini','promptVersion','planning-1'),'items',jsonb_build_array(pg_temp.test_definition()||jsonb_build_object('origin','AI_PROPOSED','derivationType','AI_INFERENCE','confidence','SUPPORTED'))))::text,true);
select pg_temp.assert_true((select state='COMPLETED' and result_id=current_setting('retry.plan')::uuid from public.ai_reasoning_requests where id=(current_setting('retry.first')::jsonb->>'id')::uuid),'first attempt succeeds atomically');
select pg_temp.expect_error('select pg_temp.retry_admit(repeat(''a'',64))','23505','successful request cannot be duplicated');
reset role;
truncate public.ai_reasoning_requests;
-- Each failure retains its original full liability and requires a fresh reservation.
do $$ declare code text;first jsonb;second jsonb;begin
 foreach code in array array['RATE_LIMIT','PROVIDER_TRANSIENT','PRE_SEND'] loop
  execute 'set local role authenticated';
  first:=pg_temp.retry_admit(repeat('b',64));
  perform pg_temp.retry_finish(first,'FAILED',code);
  perform pg_temp.expect_error('select pg_temp.retry_admit(repeat(''b'',64))','54000',code||' keeps rolling cooldown');
  execute 'reset role';update public.ai_reasoning_requests set created_at=clock_timestamp()-interval '121 seconds';
  execute 'set local role authenticated';second:=pg_temp.retry_admit(repeat('b',64));
  perform pg_temp.assert_true(second->>'id'<>first->>'id',code||' creates distinct attempt');
  perform pg_temp.assert_true((select count(*)=2 and sum(reserved_micro_usd)=22400 from public.ai_reasoning_requests),code||' preserves both reservations');
  perform pg_temp.expect_error('select pg_temp.retry_admit(repeat(''b'',64))','23505',code||' new inflight attempt blocks duplicates');
  perform pg_temp.expect_error(format('select pg_temp.retry_finish(%L::jsonb,''FAILED'',%L)',first::text,code),'40001',code||' original settlement immutable');
  execute 'reset role';truncate public.ai_reasoning_requests;
 end loop;
end;$$;
do $$ declare code text;t jsonb;begin
 foreach code in array array['TIMEOUT','NETWORK','USAGE_UNCERTAIN','PROVIDER'] loop
  execute 'set local role authenticated';t:=pg_temp.retry_admit(repeat('c',64));
  perform pg_temp.retry_finish(t,case when code='PROVIDER' then 'FAILED' else 'UNCERTAIN' end,code);
  execute 'reset role';update public.ai_reasoning_requests set created_at=clock_timestamp()-interval '121 seconds';
  execute 'set local role authenticated';
  perform pg_temp.expect_error('select pg_temp.retry_admit(repeat(''c'',64))','23505',code||' uncertainty or legacy ambiguity remains blocked');
  perform pg_temp.assert_true((select count(*)=1 and sum(reserved_micro_usd)=11200 and bool_and(usage_estimated) from public.ai_reasoning_requests),code||' retains estimated liability');
  execute 'reset role';truncate public.ai_reasoning_requests;
 end loop;
end;$$;
set local role authenticated;
select set_config('retry.lost',pg_temp.retry_admit(repeat('d',64))::text,true);
reset role;update public.ai_reasoning_requests set created_at=clock_timestamp()-interval '121 seconds';
set local role authenticated;
select pg_temp.expect_error('select pg_temp.retry_admit(repeat(''d'',64))','23505','lost acknowledgment or unsettled reservation remains blocked');
select pg_temp.retry_finish(current_setting('retry.lost')::jsonb,'FAILED','RATE_LIMIT');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.ai_reasoning_requests),'cross-tenant retry receipts hidden');
select pg_temp.expect_error('select pg_temp.retry_admit(repeat(''d'',64))','42501','cross-tenant retry admission blocked');
select pg_temp.expect_error('select pg_temp.retry_finish(current_setting(''retry.lost'')::jsonb,''FAILED'',''RATE_LIMIT'')','42501','cross-tenant reconciliation blocked');
reset role;
insert into public.ai_reasoning_requests(workspace_id,project_id,api_import_id,created_by,workflow,anchor_id,model,context_hash,state,error_code,completed_at,created_at)
 select current_setting('test.g_wa')::uuid,current_setting('test.g_pa')::uuid,current_setting('test.g_import')::uuid,'14000000-0000-0000-0000-000000000001','PLANNING',current_setting('test.qa_first')::uuid,'gpt-4.1-mini',encode(sha256(convert_to(n::text,'UTF8')),'hex'),'FAILED','RATE_LIMIT',clock_timestamp(),clock_timestamp()-interval '121 seconds' from generate_series(1,9) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
select pg_temp.expect_error('select pg_temp.retry_admit(repeat(''d'',64))','54000','retry cannot bypass daily project or actor budget');
select pg_temp.assert_true((select count(*)=10 and sum(reserved_micro_usd)=112000 from public.ai_reasoning_requests),'failed attempts consume full daily liability');
reset role;
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.ai_reasoning_requests'::regclass),'retry migration preserves RLS');
select pg_temp.assert_true(not has_function_privilege('anon','public.admit_ai_reasoning(uuid,uuid,text,uuid,text,text)','EXECUTE') and not has_function_privilege('service_role','public.admit_ai_reasoning(uuid,uuid,text,uuid,text,text)','EXECUTE'),'retry grants remain authenticated only');
select public.validate_execution_runner_role();
select count(*) as ai_retry_assertions from pg_temp.qa_results;
rollback;
