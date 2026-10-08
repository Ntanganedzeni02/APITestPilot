begin;
-- Additive operational state; historical result/evidence tables remain untouched.
alter table public.execution_runs
 add column claim_expires_at timestamptz,
 add column claim_started_at timestamptz,
 add column claim_generation bigint not null default 0 check(claim_generation>=0),
 add column claim_recoveries integer not null default 0 check(claim_recoveries between 0 and 3),
 add column completed_claim_token uuid,
 add column recovery_outcome text check(recovery_outcome in ('INDETERMINATE','EXHAUSTED','CANCELLED'));
create index execution_stale_claims on public.execution_runs(claim_expires_at,id) where status in ('SAFETY_REVIEW','RUNNING');
create table public.execution_recovery_events (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,run_id uuid not null,
 generation bigint not null check(generation>=0),event text not null check(event in ('CLAIMED','RECOVERED_UNSENT','RECOVERY_INDETERMINATE','RECOVERY_EXHAUSTED','RECOVERY_CANCELLED')),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(run_id,workspace_id) references public.execution_runs(id,workspace_id)
);
create index execution_recovery_history on public.execution_recovery_events(workspace_id,run_id,created_at,id);
alter table public.execution_recovery_events enable row level security;
create policy execution_recovery_read on public.execution_recovery_events for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.execution_recovery_events from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.execution_recovery_events to authenticated;
-- Fence legacy in-flight claims after a bounded adoption window. No history is rewritten.
update public.execution_runs set claim_started_at=clock_timestamp(),claim_expires_at=clock_timestamp()+interval '45 seconds'
 where claim_token is not null and status in ('SAFETY_REVIEW','RUNNING');
-- Preserve M1.7 policy/result validation behind private, non-callable core routines.
alter function public.claim_test_execution() rename to execution_core_claim;
alter function public.record_execution_safety(uuid,uuid,text,jsonb,jsonb,jsonb,text) rename to execution_core_safety;
alter function public.finish_test_execution(uuid,uuid,jsonb) rename to execution_core_finish;
alter function public.authorize_execution_send(uuid,uuid,text,uuid,text) rename to execution_core_authorize;
revoke all on function public.execution_core_claim(),public.execution_core_safety(uuid,uuid,text,jsonb,jsonb,jsonb,text),public.execution_core_finish(uuid,uuid,jsonb),public.execution_core_authorize(uuid,uuid,text,uuid,text) from public,anon,authenticated,service_role,testpilot_runner;
create function public.recover_execution_claims() returns void language plpgsql set search_path='' as $$
declare r public.execution_runs%rowtype; event_name text;
begin
 for r in select * from public.execution_runs where status in ('SAFETY_REVIEW','RUNNING') and claim_expires_at<=clock_timestamp() order by claim_expires_at,id for update skip locked limit 64 loop
  -- Lock and clock fence: an expired nonce can never renew or regain sending authority.
  if r.send_authorized_at is not null then
   update public.execution_runs set status='ERROR',recovery_outcome='INDETERMINATE',completed_at=clock_timestamp(),claim_token=null,claim_expires_at=null where id=r.id;
   event_name:='RECOVERY_INDETERMINATE';
  elsif r.cancel_requested then
   update public.execution_runs set status='CANCELLED',recovery_outcome='CANCELLED',completed_at=clock_timestamp(),claim_token=null,claim_expires_at=null where id=r.id;
   event_name:='RECOVERY_CANCELLED';
  elsif r.claim_recoveries>=3 then
   update public.execution_runs set status='ERROR',recovery_outcome='EXHAUSTED',completed_at=clock_timestamp(),claim_token=null,claim_expires_at=null where id=r.id;
   event_name:='RECOVERY_EXHAUSTED';
  else
   update public.execution_runs set status='REQUESTED',decision=null,policy_version=null,reason_codes='[]',facts=null,request=null,fingerprint=null,approved_by=null,approved_fingerprint=null,claim_token=null,claim_expires_at=null,started_at=null,claim_recoveries=claim_recoveries+1 where id=r.id;
   event_name:='RECOVERED_UNSENT';
  end if;
  insert into public.execution_recovery_events(workspace_id,run_id,generation,event) values(r.workspace_id,r.id,r.claim_generation,event_name);
 end loop;
end;$$;
revoke all on function public.recover_execution_claims() from public,anon,authenticated,service_role,testpilot_runner;
create function public.claim_test_execution() returns jsonb language plpgsql security definer set search_path='' as $$
declare job jsonb;r public.execution_runs%rowtype;
begin
 perform public.recover_execution_claims();
 job:=public.execution_core_claim();if job is null then return null;end if;
 update public.execution_runs set claim_started_at=clock_timestamp(),claim_expires_at=clock_timestamp()+interval '45 seconds',claim_generation=claim_generation+1 where id=(job->'run'->>'id')::uuid returning * into r;
 insert into public.execution_recovery_events(workspace_id,run_id,generation,event) values(r.workspace_id,r.id,r.claim_generation,'CLAIMED');
 return public.execution_worker_context(r);
end;$$;
create function public.record_execution_safety(run_input uuid,token_input uuid,decision_input text,codes_input jsonb,facts_input jsonb,request_input jsonb,fingerprint_input text) returns void language plpgsql security definer set search_path='' as $$
declare r public.execution_runs%rowtype;
begin
 select * into r from public.execution_runs where id=run_input for update;
 if r.id is null or r.claim_token is distinct from token_input or r.claim_expires_at is null or r.claim_expires_at<=clock_timestamp() then raise exception 'Claim fenced' using errcode='23514';end if;
 perform public.execution_core_safety(run_input,token_input,decision_input,codes_input,facts_input,request_input,fingerprint_input);
 update public.execution_runs set claim_expires_at=null where id=r.id;
end;$$;
create function public.authorize_execution_send(run_input uuid,token_input uuid,fingerprint_input text,config_input uuid,policy_input text) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.execution_runs%rowtype;
begin
 select * into r from public.execution_runs where id=run_input for update;
 if r.id is null or r.claim_token is distinct from token_input or r.claim_expires_at is null or r.claim_expires_at<=clock_timestamp() then return false;end if;
 -- The unchanged core commits one durable intent. Never retry an uncertain acknowledgment.
 return public.execution_core_authorize(run_input,token_input,fingerprint_input,config_input,policy_input);
end;$$;
create or replace function public.execution_cancel_requested(run_input uuid,token_input uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.execution_runs%rowtype;
begin
 select * into r from public.execution_runs where id=run_input for update;
 if r.id is null or r.claim_token is distinct from token_input or r.status not in ('SAFETY_REVIEW','RUNNING') or r.claim_expires_at is null or r.claim_expires_at<=clock_timestamp() or r.claim_started_at+interval '120 seconds'<=clock_timestamp() or r.cancel_requested or not public.execution_binding_current(r) then return true;end if;
 update public.execution_runs set claim_expires_at=least(clock_timestamp()+interval '45 seconds',claim_started_at+interval '120 seconds') where id=r.id;
 return false;
end;$$;
create function public.finish_test_execution(run_input uuid,token_input uuid,result_input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.execution_runs%rowtype;
begin
 select * into r from public.execution_runs where id=run_input for update;
 -- Exact nonce and payload equality make lost-ack persistence retries idempotent.
 if r.id is not null and r.completed_claim_token=token_input and exists(select 1 from public.execution_results where run_id=r.id and result=result_input) then return;end if;
 if r.id is null or r.claim_token is distinct from token_input or r.claim_expires_at is null or r.claim_expires_at<=clock_timestamp() then raise exception 'Claim fenced' using errcode='23514';end if;
 perform public.execution_core_finish(run_input,token_input,result_input);
 update public.execution_runs set claim_expires_at=null,completed_claim_token=token_input,recovery_outcome=case when r.send_authorized_at is not null and result_input->>'outcome' in ('ERROR','CANCELLED','BLOCKED') then 'INDETERMINATE' end where id=r.id;
end;$$;
revoke all on function public.claim_test_execution(),public.record_execution_safety(uuid,uuid,text,jsonb,jsonb,jsonb,text),public.finish_test_execution(uuid,uuid,jsonb),public.authorize_execution_send(uuid,uuid,text,uuid,text),public.execution_cancel_requested(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_test_execution(),public.record_execution_safety(uuid,uuid,text,jsonb,jsonb,jsonb,text),public.finish_test_execution(uuid,uuid,jsonb),public.authorize_execution_send(uuid,uuid,text,uuid,text),public.execution_cancel_requested(uuid,uuid) to testpilot_runner;
-- Recovered delivery uncertainty is authoritative provenance, never invented evidence.
-- Preserve existing private signatures, owners and ACLs; no new runner authority.
create or replace function public.intelligence_inputs(project_input uuid,environment_input uuid) returns jsonb language sql stable set search_path='' as $$
with source as (select * from public.api_imports where project_id=project_input order by created_at desc,id desc limit 1),
indeterminate as (select r.id,public.curiosity_operation(r.case_id) operation from public.execution_runs r join source s on s.id=r.api_import_id where r.project_id=project_input and r.environment_id=environment_input and r.recovery_outcome='INDETERMINATE' and not exists(select 1 from public.evidence_packages ep where ep.run_id=r.id)),
analysis as (select q.* from public.qa_analyses q join source s on s.id=q.api_import_id order by q.created_at desc,q.id desc limit 1),
known as (select distinct '["OPERATION",'||to_jsonb(op->>'key')::text||']' operation from source s,lateral jsonb_array_elements(s.knowledge->'operations') op where nullif(op->>'key','') is not null),
events as (select r.*,er.result,e.id package_id,public.curiosity_operation(r.case_id) operation,
 greatest(0,(current_timestamp at time zone 'UTC')::date-(r.completed_at at time zone 'UTC')::date) age
 from public.execution_runs r join source s on s.id=r.api_import_id join public.execution_results er on er.run_id=r.id join public.evidence_packages e on e.run_id=r.id
 where r.project_id=project_input and r.environment_id=environment_input and r.completed_at is not null and public.execution_result_safe(er.result)),
asserted as (select e.* from events e join known k on k.operation=e.operation where e.result->'sent'='true'::jsonb and exists(select 1 from jsonb_array_elements(e.result->'assertions') a where a->>'status' in ('PASS','FAIL'))),
verified as (select distinct on(operation) * from asserted order by operation,completed_at desc,id desc),
health as (select distinct on(e.operation) e.* from events e join known k on k.operation=e.operation where e.age<=30 and not exists(select 1 from indeterminate u where u.operation is null or u.operation=e.operation) and (e.result->>'outcome'='ERROR' or e.id in(select id from asserted)) order by e.operation,e.completed_at desc,e.id desc),
qa as (select q.*,rev.id review_id,rev.decision,rev.created_at reviewed_at from public.qa_items q join analysis a on a.id=q.analysis_id left join lateral(select * from public.qa_reviews where item_id=q.id order by revision desc limit 1) rev on true where rev.decision is distinct from 'REJECT'),
coverage as (select q.*,case q.severity when 'CRITICAL' then 8 when 'HIGH' then 4 when 'MEDIUM' then 2 else 1 end weight,
 q.decision='APPROVE' and exists(select 1 from asserted e join public.test_item_qa_links l on l.item_id=e.case_id and l.qa_item_id=q.id join public.test_plans p on p.id=e.plan_id where e.age<=30 and p.qa_analysis_id=q.analysis_id and q.reviewed_at<=e.completed_at and (q.kind='RISK' or exists(select 1 from public.test_requirement_versions v where v.plan_id=e.plan_id and v.requirement_id=q.id and v.review_id=q.review_id and v.status='APPROVED' and not v.has_edits))) covered from qa q),
finding_state as (select f.id,f.revision,f.status,f.severity,public.curiosity_operation(f.case_id) operation from public.findings f join public.evidence_packages p on p.id=f.first_package_id join public.execution_runs r on r.id=p.run_id join source s on s.id=r.api_import_id where f.project_id=project_input and f.environment_id=environment_input),
penalties as (select f.operation,max(case f.status when 'DISMISSED' then 0 when 'CONFIRMED' then 1 else 0.25 end*case f.severity when 'CRITICAL' then 100 when 'HIGH' then 60 when 'MEDIUM' then 30 when 'LOW' then 10 else 0 end) penalty from finding_state f where f.operation in(select operation from known) group by f.operation),
metrics as (select
 (select id from source) source_id,(select id from analysis) analysis_id,
 (select count(*) from known) known_count,(select count(*) from verified where age<=30) tested_count,
 (select count(*) from coverage where kind='REQUIREMENT') requirements,(select count(*) from coverage where kind='REQUIREMENT' and covered) covered_requirements,
 (select coalesce(sum(weight),0) from coverage where kind='RISK') risks,(select coalesce(sum(weight),0) from coverage where kind='RISK' and covered) covered_risks,
 (select coalesce(sum(case when result->>'outcome'='ERROR' then 0 else (select round(100.0*count(*) filter(where a->>'status'='PASS')/nullif(count(*) filter(where a->>'status' in ('PASS','FAIL')),0)) from jsonb_array_elements(result->'assertions') a) end),0) from health) execution_points,
 (select coalesce(sum(penalty),0) from penalties) finding_penalty,
 (select coalesce(sum(case when age<=7 then 100 when age<=30 then 50 else 0 end),0) from verified) freshness_points)
select jsonb_build_object('sourceId',source_id,'analysisId',analysis_id,'knownOperations',known_count,'testedOperations',tested_count,'activeRequirements',requirements,'coveredRequirements',covered_requirements,'riskWeight',risks,'coveredRiskWeight',covered_risks,'executionPoints',execution_points,'findingPenalty',finding_penalty,'freshnessPoints',freshness_points,
'gaps',jsonb_build_object('requirements',coalesce((select jsonb_agg(id order by id) from coverage where kind='REQUIREMENT' and covered is not true),'[]'::jsonb),'risks',coalesce((select jsonb_agg(id order by id) from coverage where kind='RISK' and covered is not true),'[]'::jsonb),'operations',coalesce((select jsonb_agg(encode(pg_catalog.sha256(pg_catalog.convert_to(operation,'UTF8')),'hex') order by operation collate "C") from known where operation not in(select operation from verified where age<=30)),'[]'::jsonb)),
'provenance',jsonb_build_object('runIds',coalesce((select jsonb_agg(id order by id) from (select id from events union select id from indeterminate) provenance_runs),'[]'::jsonb),'packageIds',coalesce((select jsonb_agg(package_id order by package_id) from events),'[]'::jsonb),'findingIds',coalesce((select jsonb_agg(id order by id) from finding_state),'[]'::jsonb),'reviewIds',coalesce((select jsonb_agg(review_id order by review_id) from coverage where review_id is not null),'[]'::jsonb),
'stateHash',encode(pg_catalog.sha256(pg_catalog.convert_to((jsonb_build_array(
 (select coalesce(jsonb_agg(jsonb_build_array(id,revision,status,severity) order by id),'[]'::jsonb) from finding_state),
 (select coalesce(jsonb_agg(jsonb_build_array(id,review_id,decision,covered) order by id),'[]'::jsonb) from coverage),
 (select coalesce(jsonb_agg(jsonb_build_array(id,case when age<=7 then 'RECENT' when age<=30 then 'AGING' else 'STALE' end) order by id),'[]'::jsonb) from verified)
 ) || case when exists(select 1 from indeterminate) then jsonb_build_array((select jsonb_agg(id order by id) from indeterminate)) else '[]'::jsonb end)::text,'UTF8')),'hex'))) from metrics;
$$;
create or replace function public.release_inputs(r public.releases,quality_input uuid) returns jsonb language sql stable set search_path='' set timezone='UTC' as $$
with current_source as(select id from public.api_imports where project_id=r.project_id order by created_at desc,id desc limit 1),
quality as (select q.* from public.quality_assessments q where q.id=quality_input and q.workspace_id=r.workspace_id and q.project_id=r.project_id and q.environment_id=r.environment_id and q.api_import_id=r.api_import_id and r.api_import_id=(select id from current_source)),
analysis as(select id from public.qa_analyses where api_import_id=r.api_import_id order by created_at desc,id desc limit 1),
events as(select run.id,run.case_id,run.plan_id,run.completed_at,e.id package_id,er.result,public.curiosity_operation(run.case_id) operation,greatest(0,(current_timestamp at time zone 'UTC')::date-(run.completed_at at time zone 'UTC')::date) age from public.execution_runs run join public.execution_results er on er.run_id=run.id join public.evidence_packages e on e.run_id=run.id where run.project_id=r.project_id and run.environment_id=r.environment_id and run.api_import_id=r.api_import_id and run.completed_at is not null and public.execution_result_safe(er.result)),
latest as(select distinct on(operation) * from events where operation is not null and (result->>'outcome'='ERROR' or result->'sent'='true'::jsonb and exists(select 1 from jsonb_array_elements(result->'assertions') a where a->>'status' in ('PASS','FAIL'))) order by operation,completed_at desc,id desc),
verified as(select distinct on(operation) * from events where operation is not null and result->'sent'='true'::jsonb and exists(select 1 from jsonb_array_elements(result->'assertions') a where a->>'status' in ('PASS','FAIL')) order by operation,completed_at desc,id desc),
qa as(select item.*,rev.id review_id,rev.decision,rev.created_at reviewed_at from public.qa_items item join analysis a on a.id=item.analysis_id left join lateral(select * from public.qa_reviews where item_id=item.id order by revision desc limit 1) rev on true where rev.decision is distinct from 'REJECT'),
coverage as(select q.*,exists(select 1 from quality qual,lateral jsonb_array_elements_text(qual.result->'inputs'->'gaps'->case q.kind when 'RISK' then 'risks' else 'requirements' end) gap where gap.value=q.id::text) uncovered,
 coalesce((select jsonb_agg(distinct e.id order by e.id) from verified e join public.test_item_qa_links l on l.item_id=e.case_id and l.qa_item_id=q.id join public.test_plans p on p.id=e.plan_id where e.age<=30 and q.decision='APPROVE' and q.reviewed_at<=e.completed_at and p.qa_analysis_id=q.analysis_id and e.result->'sent'='true'::jsonb and exists(select 1 from jsonb_array_elements(e.result->'assertions') a where a->>'status'='FAIL') and (q.kind='RISK' or exists(select 1 from public.test_requirement_versions v where v.plan_id=e.plan_id and v.requirement_id=q.id and v.review_id=q.review_id and v.status='APPROVED' and not v.has_edits))),'[]'::jsonb) failed_runs from qa q)
select jsonb_build_object(
'sourceCurrent',r.api_import_id is not distinct from (select id from current_source),
'quality',(select to_jsonb(q) from quality q),
'qualityStateMatches',case when r.api_import_id=(select id from current_source) then (select q.result->'inputs'=public.intelligence_inputs(r.project_id,r.environment_id) from quality q) else true end,
'findings',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'status',f.status,'severity',f.severity,'revision',f.revision,'caseId',f.case_id,'packageId',f.first_package_id,'occurrences',f.occurrence_count,'reviewIds',coalesce((select jsonb_agg(rev.id order by rev.id) from public.finding_reviews rev where rev.finding_id=f.id),'[]'::jsonb)) order by f.id) from public.findings f join public.evidence_packages p on p.id=f.first_package_id join public.execution_runs source_run on source_run.id=p.run_id where f.project_id=r.project_id and f.environment_id=r.environment_id and source_run.api_import_id=r.api_import_id),'[]'::jsonb),
'coverage',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'severity',c.severity,'covered',exists(select 1 from quality) and not c.uncovered,'failedRunIds',c.failed_runs,'reviewId',c.review_id) order by c.id) from coverage c),'[]'::jsonb),
'runs',coalesce((select jsonb_agg(jsonb_build_object('operationHash',encode(pg_catalog.sha256(pg_catalog.convert_to(e.operation,'UTF8')),'hex'),'runId',e.id,'packageId',e.package_id,'outcome',case when e.result->>'outcome'='ERROR' then 'ERROR' when e.result->'sent'='true'::jsonb and exists(select 1 from jsonb_array_elements(e.result->'assertions') a where a->>'status'='FAIL') then 'FAIL' when e.result->'sent'='true'::jsonb and exists(select 1 from jsonb_array_elements(e.result->'assertions') a where a->>'status'='PASS') then 'PASS' else 'UNKNOWN' end,'asserted',e.result->'sent'='true'::jsonb and exists(select 1 from jsonb_array_elements(e.result->'assertions') a where a->>'status' in ('PASS','FAIL')),'ageBand',case when e.age<=7 then 'RECENT' when e.age<=30 then 'AGING' else 'STALE' end) order by e.operation collate "C") from latest e),'[]'::jsonb),
'investigations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'status',i.status,'conclusion',i.conclusion,'revision',i.revision,'packageId',i.source_package_id,'conclusionPackageId',i.conclusion_package_id,'auditIds',coalesce((select jsonb_agg(a.id order by a.id) from public.investigation_audit_events a where a.investigation_id=i.id),'[]'::jsonb)) order by i.id) from public.investigations i join public.evidence_packages p on p.id=i.source_package_id join public.execution_runs source_run on source_run.id=p.run_id where i.project_id=r.project_id and i.environment_id=r.environment_id and source_run.api_import_id=r.api_import_id),'[]'::jsonb),
'memory',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'currentness',m.currentness,'count',m.observation_count,'caseId',m.case_id,'packageId',m.first_package_id,'observationIds',coalesce((select jsonb_agg(o.id order by o.id) from public.memory_observations o where o.fact_id=m.id),'[]'::jsonb),'runIds',coalesce((select jsonb_agg(distinct o.run_id order by o.run_id) from public.memory_observations o where o.fact_id=m.id),'[]'::jsonb),'packageIds',coalesce((select jsonb_agg(distinct o.package_id order by o.package_id) from public.memory_observations o where o.fact_id=m.id),'[]'::jsonb)) order by m.id) from public.project_memory m where m.project_id=r.project_id and m.environment_id=r.environment_id and m.api_import_id=r.api_import_id),'[]'::jsonb)) || case when exists(select 1 from public.execution_runs u where u.workspace_id=r.workspace_id and u.project_id=r.project_id and u.environment_id=r.environment_id and u.api_import_id=r.api_import_id and u.recovery_outcome='INDETERMINATE') then jsonb_build_object('indeterminateRunIds',(select jsonb_agg(u.id order by u.id) from public.execution_runs u where u.workspace_id=r.workspace_id and u.project_id=r.project_id and u.environment_id=r.environment_id and u.api_import_id=r.api_import_id and u.recovery_outcome='INDETERMINATE')) else '{}'::jsonb end;
$$;
create or replace function public.compute_release_policy(input jsonb) returns jsonb language plpgsql immutable set search_path='' set timezone='UTC' as $$
declare blockers jsonb:='[]';warnings jsonb:='[]';unknowns jsonb:='[]';entry jsonb;signal jsonb;target text;q jsonb:=input->'quality';dim record;status_value text;
begin
 for entry in select value from jsonb_array_elements(input->'findings') loop
 signal:=jsonb_build_object('ids',jsonb_build_array(entry->>'id'));
 if entry->>'status'='CONFIRMED' and entry->>'severity' in ('HIGH','CRITICAL') then blockers:=blockers||jsonb_build_array(signal||jsonb_build_object('code','CONFIRMED_BLOCKING_FINDING'));
 elsif entry->>'status'='CONFIRMED' and entry->>'severity'='MEDIUM' then warnings:=warnings||jsonb_build_array(signal||jsonb_build_object('code','CONFIRMED_MEDIUM_FINDING'));
 elsif entry->>'status'='CANDIDATE' and entry->>'severity' in ('HIGH','CRITICAL') then warnings:=warnings||jsonb_build_array(signal||jsonb_build_object('code','CANDIDATE_SEVERE_FINDING'));end if;end loop;
 for entry in select value from jsonb_array_elements(input->'coverage') loop
 if entry->'covered'='false'::jsonb then unknowns:=unknowns||jsonb_build_array(jsonb_build_object('code',case when entry->>'kind'='RISK' and entry->>'severity' in ('HIGH','CRITICAL') then 'UNCOVERED_HIGH_RISK' else 'UNCOVERED_'||(entry->>'kind') end,'ids',jsonb_build_array(entry->>'id')));end if;
 if jsonb_array_length(entry->'failedRunIds')>0 then
 signal:=jsonb_build_object('code',case when entry->>'kind'='RISK' and entry->>'severity' in ('HIGH','CRITICAL') then 'FAILED_HIGH_RISK' else 'FAILED_'||(entry->>'kind') end,'ids',jsonb_build_array(entry->>'id')||(entry->'failedRunIds'));
 if entry->>'kind'='RISK' and entry->>'severity' in ('HIGH','CRITICAL') then blockers:=blockers||jsonb_build_array(signal);else warnings:=warnings||jsonb_build_array(signal);end if;end if;end loop;
 for entry in select value from jsonb_array_elements(input->'runs') loop
 signal:=jsonb_build_object('ids',jsonb_build_array(entry->>'runId'));
 if entry->>'outcome'='UNKNOWN' then unknowns:=unknowns||jsonb_build_array(signal||jsonb_build_object('code','UNASSERTED_OPERATION'));end if;
 if entry->>'ageBand'='STALE' then unknowns:=unknowns||jsonb_build_array(signal||jsonb_build_object('code','STALE_EVIDENCE'));
 else
 if entry->>'outcome'='FAIL' then warnings:=warnings||jsonb_build_array(signal||jsonb_build_object('code','FAILED_EXECUTION'));end if;
 if entry->>'outcome'='ERROR' then warnings:=warnings||jsonb_build_array(signal||jsonb_build_object('code','INFRASTRUCTURE_ERROR'));end if;
 if entry->'asserted'='true'::jsonb and entry->>'ageBand'='AGING' then warnings:=warnings||jsonb_build_array(signal||jsonb_build_object('code','AGING_EVIDENCE'));end if;end if;end loop;
 for entry in select value from jsonb_array_elements(input->'investigations') loop
 signal:=jsonb_build_object('ids',jsonb_build_array(entry->>'id'));
 if entry->>'status' not in ('CONCLUDED','STOPPED') then unknowns:=unknowns||jsonb_build_array(signal||jsonb_build_object('code','OPEN_INVESTIGATION'));
 elsif entry->>'conclusion' in ('INCONCLUSIVE','STOPPED_BY_POLICY','BUDGET_EXHAUSTED') then warnings:=warnings||jsonb_build_array(signal||jsonb_build_object('code','INCONCLUSIVE_INVESTIGATION'));end if;end loop;
 for entry in select value from jsonb_array_elements(input->'memory') loop
 if entry->>'currentness'='CURRENT' and (entry->>'count')::integer>1 and entry->>'kind'='ASSERTION_FAILURE_OBSERVED' then warnings:=warnings||jsonb_build_array(jsonb_build_object('code','RECURRING_CURRENT_FAILURE','ids',jsonb_build_array(entry->>'id')));end if;end loop;
 if input->'sourceCurrent'='false'::jsonb then unknowns:=unknowns||jsonb_build_array(jsonb_build_object('code','SOURCE_SUPERSEDED','ids','[]'::jsonb));end if;
 if q is null or q='null'::jsonb then unknowns:=unknowns||jsonb_build_array(jsonb_build_object('code','NO_CURRENT_QUALITY','ids','[]'::jsonb));
 else
 if q->'result'->'overall'='null'::jsonb or (q->'result'->>'sufficiency')::integer<80 or q->'result'->>'confidence'='LOW' then unknowns:=unknowns||jsonb_build_array(jsonb_build_object('code','INSUFFICIENT_QUALITY_EVIDENCE','ids',jsonb_build_array(q->>'id')));end if;
 for entry in select value from jsonb_array_elements(q->'result'->'inputs'->'gaps'->'operations') loop unknowns:=unknowns||jsonb_build_array(jsonb_build_object('code','UNTESTED_OPERATION','ids',jsonb_build_array(entry)));end loop;
 for dim in select key,value from jsonb_each(q->'result'->'dimensions') order by key loop
 if dim.value->'score'<>'null'::jsonb and (dim.value->>'score')::integer<80 then warnings:=warnings||jsonb_build_array(jsonb_build_object('code','QUALITY_'||upper(dim.key)||'_BELOW_80','ids',jsonb_build_array(q->>'id')));end if;end loop;end if;
 for entry in select value from jsonb_array_elements(coalesce(input->'indeterminateRunIds','[]'::jsonb)) loop
 unknowns:=unknowns||jsonb_build_array(jsonb_build_object('code','INDETERMINATE_EXECUTION','ids',jsonb_build_array(entry)));end loop;
 status_value:=case when jsonb_array_length(blockers)>0 then 'BLOCKED' when jsonb_array_length(unknowns)>0 then 'INSUFFICIENT_EVIDENCE' when jsonb_array_length(warnings)>0 then 'CAUTION' else 'CLEAR' end;
 return jsonb_build_object('policyVersion','release-policy-v1','status',status_value,'blockers',blockers,'warnings',warnings,'unknowns',unknowns,'inputs',input);
end;$$;
select public.validate_execution_runner_role();
commit;
