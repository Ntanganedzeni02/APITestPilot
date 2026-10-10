begin;
-- Same recognizable credential formats as domain credentials.ts / M1.9 proposal validation.
-- Omit unsafe identifiers; scoped source IDs remain the authority and provenance.
create function public.memory_operation_safe(value_input text) returns boolean language plpgsql immutable set search_path='' as $$
declare decoded text:=replace(value_input,'~1','/');m text[];
begin
 if value_input is null then return true;end if;
 if public.execution_literal_safe(value_input) is distinct from true then return false;end if;
 if left(value_input,1)='[' then decoded:=replace(value_input::jsonb->>1,'~1','/');end if;
 if decoded is null then return false;end if;
 loop m:=regexp_match(decoded,'%([0-9a-fA-F]{2})');exit when m is null;decoded:=replace(decoded,'%'||m[1],chr(get_byte(decode(m[1],'hex'),0)));end loop;
 return decoded !~* '-----BEGIN|sb_secret_|eyJ[A-Za-z0-9_-]{15,}\.|(?:authorization|proxy-authorization)\s*:|bearer\s+[A-Za-z0-9._~+/-]+=*|[a-z][a-z0-9+.-]*://[^\s/@:]+:[^\s/@]+@|(?:password|passwd|access[_-]?token|token|secret|api.?key|apikey|client[_-]?secret|cookie|credential|session)\s*[:=]';
exception when others then return false;
end;$$;
revoke all on function public.memory_operation_safe(text) from public,anon,authenticated,service_role,testpilot_runner;

-- Scoped provenance keys; deployed migration files and existing policies stay immutable.
alter table public.execution_runs add constraint memory_run_scope unique(id,workspace_id,project_id,environment_id,api_import_id,behaviour_graph_id,case_id);
alter table public.finding_reviews add constraint memory_review_scope unique(id,finding_id,workspace_id,project_id);
create table public.memory_facts (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,project_id uuid not null,environment_id uuid not null,api_import_id uuid not null,graph_id uuid not null,case_id uuid not null,
 operation_id text check(public.memory_operation_safe(operation_id)),kind text not null check(kind in ('OPERATION_VERIFIED_SUCCESS','ASSERTION_FAILURE_OBSERVED','EXECUTION_ERROR_OBSERVED','BEHAVIOR_OBSERVED','FINDING_CONFIRMED','FINDING_DISMISSED','FINDING_REOBSERVED','INVESTIGATION_CONCLUDED')),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),finding_id uuid,first_package_id uuid not null,first_run_id uuid not null,
 first_observed_at timestamptz not null,last_observed_at timestamptz not null,observation_count integer not null default 0 check(observation_count>=0),
 unique(workspace_id,project_id,environment_id,fingerprint),unique(id,workspace_id,project_id,environment_id,api_import_id,graph_id,case_id),
 check(first_observed_at<=last_observed_at),
 foreign key(project_id,workspace_id) references public.projects(id,workspace_id),
 foreign key(api_import_id,project_id,workspace_id) references public.api_imports(id,project_id,workspace_id),
 foreign key(graph_id,api_import_id,project_id,workspace_id) references public.behaviour_graphs(id,api_import_id,project_id,workspace_id),
 foreign key(graph_id,operation_id,api_import_id,project_id,workspace_id) references public.behaviour_graph_nodes(graph_id,logical_id,api_import_id,project_id,workspace_id),
 foreign key(first_run_id,workspace_id,project_id,environment_id,api_import_id,graph_id,case_id) references public.execution_runs(id,workspace_id,project_id,environment_id,api_import_id,behaviour_graph_id,case_id),
 foreign key(first_package_id,first_run_id,workspace_id,project_id) references public.evidence_packages(id,run_id,workspace_id,project_id),
 foreign key(finding_id,workspace_id,project_id,environment_id,case_id) references public.findings(id,workspace_id,project_id,environment_id,case_id)
);
create table public.memory_observations (
 id uuid primary key default gen_random_uuid(),fact_id uuid not null,workspace_id uuid not null,project_id uuid not null,environment_id uuid not null,api_import_id uuid not null,graph_id uuid not null,case_id uuid not null,
 run_id uuid not null,package_id uuid not null,evidence_item_id uuid,finding_id uuid,review_id uuid,investigation_id uuid,
 source_fingerprint text not null check(source_fingerprint ~ '^[a-f0-9]{64}$'),
 claim text not null check(claim in ('PASSED','FAILED','ERROR','OBSERVED','CONFIRMED','DISMISSED','REOBSERVED','HYPOTHESIS_SUPPORTED','HYPOTHESIS_NOT_SUPPORTED','INCONCLUSIVE','STOPPED_BY_POLICY','BUDGET_EXHAUSTED')),
 observed_at timestamptz not null,derived_at timestamptz not null default clock_timestamp(),derived_by uuid not null references auth.users(id),unique(fact_id,source_fingerprint),
 foreign key(fact_id,workspace_id,project_id,environment_id,api_import_id,graph_id,case_id) references public.memory_facts(id,workspace_id,project_id,environment_id,api_import_id,graph_id,case_id),
 foreign key(run_id,workspace_id,project_id,environment_id,api_import_id,graph_id,case_id) references public.execution_runs(id,workspace_id,project_id,environment_id,api_import_id,behaviour_graph_id,case_id),
 foreign key(package_id,run_id,workspace_id,project_id) references public.evidence_packages(id,run_id,workspace_id,project_id),
 foreign key(evidence_item_id,package_id,workspace_id,project_id) references public.evidence_items(id,package_id,workspace_id,project_id),
 foreign key(finding_id,workspace_id,project_id,environment_id,case_id) references public.findings(id,workspace_id,project_id,environment_id,case_id),
 foreign key(review_id,finding_id,workspace_id,project_id) references public.finding_reviews(id,finding_id,workspace_id,project_id),
 check(review_id is null or finding_id is not null),
 foreign key(investigation_id,workspace_id,project_id,environment_id) references public.investigations(id,workspace_id,project_id,environment_id)
);
create table public.quality_assessments (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,project_id uuid not null,environment_id uuid not null,api_import_id uuid,
 scoring_version text not null check(scoring_version='api-quality-v1'),fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 assessed_at timestamptz not null default clock_timestamp(),created_by uuid not null references auth.users(id),result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=2097152),
 unique(project_id,environment_id,fingerprint),
 foreign key(project_id,workspace_id) references public.projects(id,workspace_id),
 foreign key(environment_id,project_id) references public.environments(id,project_id),
 foreign key(api_import_id,project_id,workspace_id) references public.api_imports(id,project_id,workspace_id)
);
alter table public.quality_assessments add constraint quality_assessment_scope unique(id,workspace_id,project_id,environment_id);
create table public.quality_heads (
 project_id uuid not null,environment_id uuid not null,workspace_id uuid not null,assessment_id uuid not null,previous_id uuid,refreshed_at timestamptz not null default clock_timestamp(),primary key(project_id,environment_id),
 foreign key(assessment_id,workspace_id,project_id,environment_id) references public.quality_assessments(id,workspace_id,project_id,environment_id),
 foreign key(previous_id,workspace_id,project_id,environment_id) references public.quality_assessments(id,workspace_id,project_id,environment_id),check(previous_id is null or previous_id<>assessment_id)
);
alter table public.quality_heads enable row level security;
create policy quality_heads_read on public.quality_heads for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.quality_heads from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.quality_heads to authenticated;
create index memory_history on public.memory_facts(workspace_id,project_id,environment_id,last_observed_at desc,id);
create index memory_operation_history on public.memory_facts(project_id,environment_id,api_import_id,operation_id,kind);
create index memory_observation_history on public.memory_observations(fact_id,observed_at desc,id);
create index quality_history on public.quality_assessments(workspace_id,project_id,environment_id,assessed_at desc,id);
alter table public.memory_facts enable row level security;
create policy memory_facts_read on public.memory_facts for select to authenticated using(public.is_workspace_member(workspace_id));
alter table public.memory_observations enable row level security;
create policy memory_observations_read on public.memory_observations for select to authenticated using(public.is_workspace_member(workspace_id));
alter table public.quality_assessments enable row level security;
create policy quality_assessments_read on public.quality_assessments for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.memory_facts,public.memory_observations,public.quality_assessments from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.memory_facts,public.memory_observations,public.quality_assessments to authenticated;
-- Read-time currentness cannot silently inherit old-source verification after re-import.
create view public.project_memory with (security_invoker=true) as
 select f.*,case when f.api_import_id is distinct from (select a.id from public.api_imports a where a.project_id=f.project_id order by a.created_at desc,a.id desc limit 1) then 'HISTORICAL'
 when f.kind in ('FINDING_CONFIRMED','FINDING_DISMISSED') and not exists(select 1 from public.findings finding where finding.id=f.finding_id and finding.status=case f.kind when 'FINDING_CONFIRMED' then 'CONFIRMED' else 'DISMISSED' end) then 'SUPERSEDED'
 when f.kind in ('OPERATION_VERIFIED_SUCCESS','ASSERTION_FAILURE_OBSERVED','BEHAVIOR_OBSERVED','EXECUTION_ERROR_OBSERVED') and exists(select 1 from public.memory_facts newer where newer.project_id=f.project_id and newer.environment_id=f.environment_id and newer.api_import_id=f.api_import_id and newer.case_id=f.case_id and newer.kind in ('OPERATION_VERIFIED_SUCCESS','ASSERTION_FAILURE_OBSERVED','BEHAVIOR_OBSERVED','EXECUTION_ERROR_OBSERVED') and newer.last_observed_at>f.last_observed_at) then 'SUPERSEDED'
 else 'CURRENT' end currentness from public.memory_facts f;
revoke all on public.project_memory from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.project_memory to authenticated;
create function public.intelligence_scope(project_input uuid,environment_input uuid) returns uuid language plpgsql set search_path='' as $$
declare workspace uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select p.workspace_id into workspace from public.projects p where p.id=project_input;
 perform 1 from public.workspace_members where workspace_id=workspace and user_id=auth.uid() for share;
 if not found then raise exception 'Unavailable' using errcode='42501';end if;
 perform 1 from public.projects where id=project_input for update;
 perform 1 from public.environments where id=environment_input and project_id=project_input for share;
 if not found then raise exception 'Environment unavailable' using errcode='23514';end if;
 if (select count(*) from public.execution_runs where project_id=project_input and environment_id=environment_input)>5000 then raise exception 'Intelligence history capacity reached' using errcode='23514';end if;
 return workspace;
end;$$;
-- Private bounded derivation helper. No arbitrary text or raw evidence is stored.
create function public.memory_observe(r public.execution_runs,pkg uuid,kind_input text,claim_input text,identity_input jsonb,observed timestamptz,item uuid default null,finding uuid default null,review uuid default null,investigation uuid default null) returns uuid language plpgsql set search_path='' as $$
declare signature text;source_signature text;fact uuid;added integer;operation text;
begin
 operation:=public.curiosity_operation(r.case_id);
 if public.memory_operation_safe(operation) is distinct from true then operation:=null;end if;
 if kind_input='OPERATION_VERIFIED_SUCCESS' and operation is null then return null;end if;
 signature:=encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_array(r.workspace_id,r.project_id,r.environment_id,r.api_import_id,r.behaviour_graph_id,r.case_id,operation,kind_input,identity_input,finding)::text,'UTF8')),'hex');
 source_signature:=encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_array(r.id,pkg,item,review,investigation,claim_input)::text,'UTF8')),'hex');
 insert into public.memory_facts(workspace_id,project_id,environment_id,api_import_id,graph_id,case_id,operation_id,kind,fingerprint,finding_id,first_package_id,first_run_id,first_observed_at,last_observed_at)
 values(r.workspace_id,r.project_id,r.environment_id,r.api_import_id,r.behaviour_graph_id,r.case_id,operation,kind_input,signature,finding,pkg,r.id,observed,observed) on conflict(workspace_id,project_id,environment_id,fingerprint) do nothing returning id into fact;
 if fact is null then select id into fact from public.memory_facts where workspace_id=r.workspace_id and project_id=r.project_id and environment_id=r.environment_id and fingerprint=signature for update;end if;
 insert into public.memory_observations(fact_id,workspace_id,project_id,environment_id,api_import_id,graph_id,case_id,run_id,package_id,evidence_item_id,finding_id,review_id,investigation_id,source_fingerprint,claim,observed_at,derived_by)
 values(fact,r.workspace_id,r.project_id,r.environment_id,r.api_import_id,r.behaviour_graph_id,r.case_id,r.id,pkg,item,finding,review,investigation,source_signature,claim_input,observed,auth.uid()) on conflict(fact_id,source_fingerprint) do nothing;
 get diagnostics added=row_count;
 if added=1 then update public.memory_facts set observation_count=observation_count+1,first_observed_at=least(first_observed_at,observed),last_observed_at=greatest(last_observed_at,observed) where id=fact;end if;
 return fact;
end;$$;
create function public.refresh_project_memory(project_input uuid,environment_input uuid) returns integer language plpgsql security definer set search_path='' as $$
declare workspace uuid;r public.execution_runs%rowtype;v jsonb;pkg uuid;entry record;idx integer;item uuid;f uuid;before_count integer;
begin
 workspace:=public.intelligence_scope(project_input,environment_input);
 select count(*) into before_count from public.memory_observations where project_id=project_input and environment_id=environment_input;
 for r in select run.* from public.execution_runs run join public.execution_results er on er.run_id=run.id where run.project_id=project_input and run.environment_id=environment_input and run.status in ('COMPLETED','ERROR','BLOCKED','CANCELLED') and run.completed_at is not null order by run.completed_at,run.id for share of run loop
 select result into v from public.execution_results where run_id=r.id;
 if public.execution_result_safe(v) is distinct from true then continue;end if;
 pkg:=public.derive_execution_evidence(r.id);
 if v->>'outcome'='PASSED' and v->'sent'='true'::jsonb and jsonb_array_length(v->'assertions')>0 and not exists(select 1 from jsonb_array_elements(v->'assertions') a where a->>'status'<>'PASS') then
 select id into item from public.evidence_items where package_id=pkg and kind='RESPONSE_SUMMARY';
 perform public.memory_observe(r,pkg,'OPERATION_VERIFIED_SUCCESS','PASSED','null'::jsonb,r.completed_at,item);
 elsif v->>'outcome'='OBSERVED' and v->'sent'='true'::jsonb then
 select id into item from public.evidence_items where package_id=pkg and kind='RESPONSE_SUMMARY';
 perform public.memory_observe(r,pkg,'BEHAVIOR_OBSERVED','OBSERVED','null'::jsonb,r.completed_at,item);
 elsif v->>'outcome'='ERROR' then
 select id into item from public.evidence_items where package_id=pkg and kind='EXECUTION_FAILURE';
 perform public.memory_observe(r,pkg,'EXECUTION_ERROR_OBSERVED','ERROR',v->'failure',r.completed_at,item);
 end if;
 idx:=0;
 for entry in select value a from jsonb_array_elements(v->'assertions') loop
 if entry.a->>'status'='FAIL' and v->'sent'='true'::jsonb then
 select id into item from public.evidence_items where package_id=pkg and kind='ASSERTION_RESULT' and assertion_index=idx;
 select occurrence.finding_id into f from public.finding_occurrences occurrence where package_id=pkg and assertion_index=idx;
 perform public.memory_observe(r,pkg,'ASSERTION_FAILURE_OBSERVED','FAILED',entry.a-array['reason','status'],r.completed_at,item,f);
 end if;idx:=idx+1;end loop;
 end loop;
 -- A persisted human review is the authority, not copied review notes or AI claims.
 for entry in select rev.id review_id,rev.new_status,rev.created_at,finding.* from public.finding_reviews rev join public.findings finding on finding.id=rev.finding_id where finding.project_id=project_input and finding.environment_id=environment_input order by rev.created_at,rev.id for share of finding loop
 select run.* into r from public.execution_runs run join public.evidence_packages e on e.run_id=run.id where e.id=entry.first_package_id;
 perform public.memory_observe(r,entry.first_package_id,case entry.new_status when 'CONFIRMED' then 'FINDING_CONFIRMED' else 'FINDING_DISMISSED' end,entry.new_status,to_jsonb(entry.id),entry.created_at,null,entry.id,entry.review_id);
 end loop;
 for entry in select occurrence.*,rev.id review_id from public.finding_occurrences occurrence join public.findings finding on finding.id=occurrence.finding_id join public.finding_reviews rev on rev.finding_id=finding.id and rev.decision='DISMISS' where occurrence.project_id=project_input and occurrence.environment_id=environment_input and occurrence.observed_at>rev.created_at order by occurrence.observed_at,occurrence.id loop
 select run.* into r from public.execution_runs run join public.evidence_packages e on e.run_id=run.id where e.id=entry.package_id;
 perform public.memory_observe(r,entry.package_id,'FINDING_REOBSERVED','REOBSERVED',to_jsonb(entry.finding_id),entry.observed_at,null,entry.finding_id,entry.review_id);
 end loop;
 for entry in select i.*,(select max(a.created_at) from public.investigation_audit_events a where a.investigation_id=i.id and a.event in ('INVESTIGATION_CONCLUDED','INVESTIGATION_STOPPED')) observed from public.investigations i where i.project_id=project_input and i.environment_id=environment_input and i.status in ('CONCLUDED','STOPPED') order by i.id for share of i loop
 if entry.observed is null then continue;end if;
 select run.* into r from public.execution_runs run join public.evidence_packages e on e.run_id=run.id where e.id=entry.source_package_id;
 perform public.memory_observe(r,entry.source_package_id,'INVESTIGATION_CONCLUDED',entry.conclusion,to_jsonb(entry.id),entry.observed,null,null,null,entry.id);
 end loop;
 return (select count(*) from public.memory_observations where project_id=project_input and environment_id=environment_input)-before_count;
end;$$;
-- All scoring inputs are loaded in one statement snapshot, never supplied by clients.
create function public.intelligence_inputs(project_input uuid,environment_input uuid) returns jsonb language sql stable set search_path='' as $$
with source as (select * from public.api_imports where project_id=project_input order by created_at desc,id desc limit 1),
analysis as (select q.* from public.qa_analyses q join source s on s.id=q.api_import_id order by q.created_at desc,q.id desc limit 1),
known as (select distinct '["OPERATION",'||to_jsonb(op->>'key')::text||']' operation from source s,lateral jsonb_array_elements(s.knowledge->'operations') op where nullif(op->>'key','') is not null),
events as (select r.*,er.result,e.id package_id,public.curiosity_operation(r.case_id) operation,
 greatest(0,(current_timestamp at time zone 'UTC')::date-(r.completed_at at time zone 'UTC')::date) age
 from public.execution_runs r join source s on s.id=r.api_import_id join public.execution_results er on er.run_id=r.id join public.evidence_packages e on e.run_id=r.id
 where r.project_id=project_input and r.environment_id=environment_input and r.completed_at is not null and public.execution_result_safe(er.result)),
asserted as (select e.* from events e join known k on k.operation=e.operation where e.result->'sent'='true'::jsonb and exists(select 1 from jsonb_array_elements(e.result->'assertions') a where a->>'status' in ('PASS','FAIL'))),
verified as (select distinct on(operation) * from asserted order by operation,completed_at desc,id desc),
health as (select distinct on(e.operation) e.* from events e join known k on k.operation=e.operation where e.age<=30 and (e.result->>'outcome'='ERROR' or e.id in(select id from asserted)) order by e.operation,e.completed_at desc,e.id desc),
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
'provenance',jsonb_build_object('runIds',coalesce((select jsonb_agg(id order by id) from events),'[]'::jsonb),'packageIds',coalesce((select jsonb_agg(package_id order by package_id) from events),'[]'::jsonb),'findingIds',coalesce((select jsonb_agg(id order by id) from finding_state),'[]'::jsonb),'reviewIds',coalesce((select jsonb_agg(review_id order by review_id) from coverage where review_id is not null),'[]'::jsonb),
'stateHash',encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_array(
 (select coalesce(jsonb_agg(jsonb_build_array(id,revision,status,severity) order by id),'[]'::jsonb) from finding_state),
 (select coalesce(jsonb_agg(jsonb_build_array(id,review_id,decision,covered) order by id),'[]'::jsonb) from coverage),
 (select coalesce(jsonb_agg(jsonb_build_array(id,case when age<=7 then 'RECENT' when age<=30 then 'AGING' else 'STALE' end) order by id),'[]'::jsonb) from verified)
 )::text,'UTF8')),'hex'))) from metrics;
$$;
-- Private pure arithmetic; paired with framework-independent domain parity tests.
create function public.quality_dimension(n numeric,d numeric,w integer,basis text) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('score',case when d>0 then round(100*n/d) end,'numerator',n,'denominator',d,'weight',w,'basis',basis);
$$;
create function public.compute_api_quality(input jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare dims jsonb;overall numeric;suff numeric;fraction_n numeric:=0;fraction_d numeric:=1;term record;known numeric:=(input->>'knownOperations')::numeric;tested numeric:=(input->>'testedOperations')::numeric;requirements numeric:=(input->>'activeRequirements')::numeric;risks numeric:=(input->>'riskWeight')::numeric;
begin
 dims:=jsonb_build_object(
 'requirements',public.quality_dimension((input->>'coveredRequirements')::numeric,requirements,25,'Active requirements with reviewed-version-matching asserted evidence within 30 UTC days.'),
 'risks',public.quality_dimension((input->>'coveredRiskWeight')::numeric,risks,25,'Severity-weighted active risks with asserted evidence within 30 UTC days.'),
 'execution',public.quality_dimension((input->>'executionPoints')::numeric,100*known,25,'Latest 30-day assertion health per operation; infrastructure errors earn zero health points, not defect confirmation. Untested operations earn no points.'),
 'findings',public.quality_dimension(case when tested>0 then 100*known-(input->>'findingPenalty')::numeric else 0 end,case when tested>0 then 100*known else 0 end,15,'Maximum unresolved finding penalty per known operation; unreviewed/stale findings remain active: confirmed severity penalty, candidate quarter penalty, dismissed zero.'),
 'freshness',public.quality_dimension((input->>'freshnessPoints')::numeric,100*known,10,'Latest asserted observation per operation: 100 points through day 7, 50 through day 30, otherwise zero.'));
 if tested>0 and known>0 then select round(sum(coalesce((value->>'score')::numeric,0)*(value->>'weight')::numeric)/100) into overall from jsonb_each(dims);end if;
 -- Combine integer fractions before rounding; numeric division intermediates can drift at half ties.
 for term in select * from (values(40*tested,known),(20*(input->>'coveredRequirements')::numeric,requirements),(20*(input->>'coveredRiskWeight')::numeric,risks),(20*(input->>'freshnessPoints')::numeric,100*known)) t(n,d) loop
 if term.d>0 then fraction_n:=fraction_n*term.d+term.n*fraction_d;fraction_d:=fraction_d*term.d;end if;
 end loop;
 suff:=pg_catalog.div(2*fraction_n+fraction_d,2*fraction_d);
 return jsonb_build_object('scoringVersion','api-quality-v1','overall',overall,'sufficiency',suff,'confidence',case when tested>=5 and suff>=80 then 'HIGH' when tested>=3 and suff>=40 then 'MEDIUM' else 'LOW' end,'status',case when overall is null then 'UNKNOWN' when overall>=80 then 'STRONG' when overall>=50 then 'MODERATE' else 'WEAK' end,'dimensions',dims,'inputs',input);
end;$$;
create function public.assess_project_quality(project_input uuid,environment_input uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare workspace uuid;input jsonb;computed jsonb;signature text;result_id uuid;
begin
 workspace:=public.intelligence_scope(project_input,environment_input);
 input:=public.intelligence_inputs(project_input,environment_input);
 if (input->>'knownOperations')::integer>5000 or (input->>'activeRequirements')::integer>1000 or (input->>'riskWeight')::integer>8000 or octet_length(input::text)>2000000 then raise exception 'Intelligence capacity reached' using errcode='23514';end if;
 computed:=public.compute_api_quality(input);
 signature:=encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_array('api-quality-v1',workspace,project_input,environment_input,input)::text,'UTF8')),'hex');
 insert into public.quality_assessments(workspace_id,project_id,environment_id,api_import_id,scoring_version,fingerprint,result,created_by)
 values(workspace,project_input,environment_input,(input->>'sourceId')::uuid,'api-quality-v1',signature,computed,auth.uid()) on conflict(project_id,environment_id,fingerprint) do nothing returning id into result_id;
 if result_id is null then select id into result_id from public.quality_assessments where project_id=project_input and environment_id=environment_input and fingerprint=signature;end if;
 insert into public.quality_heads(project_id,environment_id,workspace_id,assessment_id) values(project_input,environment_input,workspace,result_id)
 on conflict(project_id,environment_id) do update set previous_id=case when public.quality_heads.assessment_id<>excluded.assessment_id then public.quality_heads.assessment_id else public.quality_heads.previous_id end,assessment_id=excluded.assessment_id,refreshed_at=clock_timestamp();
 return result_id;
end;$$;
revoke all on function public.intelligence_scope(uuid,uuid) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.memory_observe(public.execution_runs,uuid,text,text,jsonb,timestamptz,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.intelligence_inputs(uuid,uuid) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.quality_dimension(numeric,numeric,integer,text) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.compute_api_quality(jsonb) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.refresh_project_memory(uuid,uuid),public.assess_project_quality(uuid,uuid) from public,anon,authenticated,service_role,testpilot_runner;
grant execute on function public.refresh_project_memory(uuid,uuid),public.assess_project_quality(uuid,uuid) to authenticated;
select public.validate_execution_runner_role();
commit;
