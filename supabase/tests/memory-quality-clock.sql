-- Local-only controlled clock: no authoritative row mutations between assessments.
\ir fixtures/curiosity-source.sql
truncate pg_temp.qa_results;
create function pg_temp.memory_test_clock() returns timestamptz language sql stable as $$select current_setting('m.clock')::timestamptz;$$;
-- Replace only the clock in the production function inside this rollback transaction.
do $$begin execute replace(pg_get_functiondef('public.intelligence_inputs(uuid,uuid)'::regprocedure),'CURRENT_TIMESTAMP','pg_temp.memory_test_clock()');end;$$;
-- pg_get_functiondef preserves source casing; replace the actual lower-case token too.
do $$begin execute replace(pg_get_functiondef('public.intelligence_inputs(uuid,uuid)'::regprocedure),'current_timestamp','pg_temp.memory_test_clock()');end;$$;
set local timezone='UTC';
select set_config('m.rows_before',(select md5(jsonb_agg(to_jsonb(r) order by r.id)::text) from public.execution_runs r),true);
select set_config('m.base',(select ((completed_at at time zone 'UTC')::date::text||'T12:00:00Z') from public.execution_runs where id=current_setting('ev.run')::uuid),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
select public.refresh_project_memory(current_setting('test.g_pa')::uuid,current_setting('exec.environment')::uuid);
select set_config('m.clock',(current_setting('m.base')::timestamptz+interval '7 days')::text,true);
select set_config('m.recent',public.assess_project_quality(current_setting('test.g_pa')::uuid,current_setting('exec.environment')::uuid)::text,true);
select pg_temp.assert_true((select result->'inputs'->>'freshnessPoints'='100' from public.quality_assessments where id=current_setting('m.recent')::uuid),'day seven recent');
select set_config('m.clock',(current_setting('m.base')::timestamptz+interval '8 days')::text,true);
select set_config('m.aging',public.assess_project_quality(current_setting('test.g_pa')::uuid,current_setting('exec.environment')::uuid)::text,true);
select pg_temp.assert_true(current_setting('m.recent')<>current_setting('m.aging'),'clock-only recent to aging creates distinct snapshot');
select pg_temp.assert_true((select result->'inputs'->>'freshnessPoints'='50' from public.quality_assessments where id=current_setting('m.aging')::uuid),'day eight aging');
reset role;
set local timezone='UTC';
select set_config('m.utc',public.intelligence_inputs(current_setting('test.g_pa')::uuid,current_setting('exec.environment')::uuid)::text,true);
set local timezone='Pacific/Kiritimati';
select pg_temp.assert_true(public.intelligence_inputs(current_setting('test.g_pa')::uuid,current_setting('exec.environment')::uuid)=current_setting('m.utc')::jsonb,'session timezone cannot change freshness or state fingerprint');
set local role authenticated;
select pg_temp.assert_true(public.assess_project_quality(current_setting('test.g_pa')::uuid,current_setting('exec.environment')::uuid)=current_setting('m.aging')::uuid,'timezone change reuses identical snapshot');
select set_config('m.clock',(current_setting('m.base')::timestamptz+interval '30 days')::text,true);
select pg_temp.assert_true(public.assess_project_quality(current_setting('test.g_pa')::uuid,current_setting('exec.environment')::uuid)=current_setting('m.aging')::uuid,'day thirty retains aging snapshot');
select set_config('m.clock',(current_setting('m.base')::timestamptz+interval '31 days')::text,true);
select set_config('m.stale',public.assess_project_quality(current_setting('test.g_pa')::uuid,current_setting('exec.environment')::uuid)::text,true);
select pg_temp.assert_true(current_setting('m.stale')<>current_setting('m.aging'),'clock-only aging to stale creates distinct snapshot');
select pg_temp.assert_true((select result->'inputs'->>'freshnessPoints'='0' and result->>'status'='UNKNOWN' from public.quality_assessments where id=current_setting('m.stale')::uuid),'day thirty-one stale and unknown');
select pg_temp.assert_true((select result->'inputs'->>'freshnessPoints'='100' from public.quality_assessments where id=current_setting('m.recent')::uuid),'historical snapshot unchanged');
set local timezone='UTC';
select pg_temp.assert_true((select md5(jsonb_agg(to_jsonb(r) order by r.id)::text) from public.execution_runs r)=current_setting('m.rows_before'),'authoritative execution rows unchanged during clock transitions');
reset role;
select count(*) as clock_assertions_passed from pg_temp.qa_results;
rollback;
