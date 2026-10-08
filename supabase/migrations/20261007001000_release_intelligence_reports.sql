begin;
-- Reuse TestPilot recognizable credential formats for bounded human text.
-- Human prose is not an operation path; normal words such as password reset are allowed.
create function public.release_text_safe(value_input text,max_input integer) returns boolean language plpgsql immutable set search_path='' as $$
declare decoded text:=value_input;m text[];
begin
 if value_input is null or max_input not between 1 and 1000 or length(value_input)>max_input or value_input ~ '[[:cntrl:]]' then return false;end if;
 loop m:=regexp_match(decoded,'%([0-9a-fA-F]{2})');exit when m is null;decoded:=replace(decoded,'%'||m[1],chr(get_byte(decode(m[1],'hex'),0)));end loop;
 return decoded !~* '-----BEGIN|sb_secret_|eyJ[A-Za-z0-9_-]{15,}\.|(?:authorization|proxy-authorization)\s*:|bearer\s+[A-Za-z0-9._~+/-]+=*|[a-z][a-z0-9+.-]*://[^\s/@:]+:[^\s/@]+@|(?:password|passwd|access[_-]?token|token|secret|api.?key|apikey|client[_-]?secret|cookie|credential|session)\s*[:=]' and decoded !~ '[[:cntrl:]]';
exception when others then return false;
end;$$;
revoke all on function public.release_text_safe(text,integer) from public,anon,authenticated,service_role,testpilot_runner;

-- Additive candidate key only; existing M1.10 authority/functions remain unchanged.
alter table public.quality_assessments add constraint release_quality_scope unique(id,workspace_id,project_id,environment_id,api_import_id);
create table public.releases (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,project_id uuid not null,environment_id uuid not null,api_import_id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 120 and public.release_text_safe(name,120)),
 created_at timestamptz not null default clock_timestamp(),created_by uuid not null references auth.users(id),
 assessment_id uuid,decision_id uuid,decision_revision integer not null default 0 check(decision_revision>=0),
 unique(id,workspace_id,project_id,environment_id,api_import_id),
 foreign key(project_id,workspace_id) references public.projects(id,workspace_id),
 foreign key(environment_id,project_id) references public.environments(id,project_id),
 foreign key(api_import_id,project_id,workspace_id) references public.api_imports(id,project_id,workspace_id)
);
create table public.release_assessments (
 id uuid primary key default gen_random_uuid(),release_id uuid not null,workspace_id uuid not null,project_id uuid not null,environment_id uuid not null,api_import_id uuid not null,
 quality_assessment_id uuid,policy_version text not null check(policy_version='release-policy-v1'),fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=2097152),assessed_at timestamptz not null default clock_timestamp(),created_by uuid not null references auth.users(id),
 unique(release_id,fingerprint),unique(id,release_id,workspace_id,project_id,environment_id,api_import_id),
 foreign key(release_id,workspace_id,project_id,environment_id,api_import_id) references public.releases(id,workspace_id,project_id,environment_id,api_import_id),
 foreign key(quality_assessment_id,workspace_id,project_id,environment_id,api_import_id) references public.quality_assessments(id,workspace_id,project_id,environment_id,api_import_id)
);
create table public.release_decisions (
 id uuid primary key default gen_random_uuid(),release_id uuid not null,workspace_id uuid not null,project_id uuid not null,environment_id uuid not null,api_import_id uuid not null,assessment_id uuid not null,
 revision integer not null check(revision>0),decision text not null check(decision in ('APPROVE','APPROVE_WITH_RISK','REJECT')),
 rationale text not null check(length(rationale)<=1000 and public.release_text_safe(rationale,1000)),is_override boolean not null,
 actor_id uuid not null references auth.users(id),decided_at timestamptz not null default clock_timestamp(),
 check(decision<>'APPROVE_WITH_RISK' or length(btrim(rationale))>0),check(not is_override or decision='APPROVE_WITH_RISK'),
 unique(release_id,revision),unique(id,release_id,workspace_id,project_id,environment_id,api_import_id),unique(id,assessment_id,release_id,workspace_id,project_id,environment_id,api_import_id),
 foreign key(assessment_id,release_id,workspace_id,project_id,environment_id,api_import_id) references public.release_assessments(id,release_id,workspace_id,project_id,environment_id,api_import_id)
);
create table public.release_reports (
 id uuid primary key default gen_random_uuid(),release_id uuid not null,workspace_id uuid not null,project_id uuid not null,environment_id uuid not null,api_import_id uuid not null,assessment_id uuid not null,decision_id uuid,
 report_version text not null check(report_version='release-report-v1'),fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=4194304),generated_at timestamptz not null default clock_timestamp(),generated_by uuid not null references auth.users(id),
 unique(id,release_id,workspace_id,project_id,environment_id,api_import_id),unique nulls not distinct(release_id,assessment_id,decision_id,report_version),unique(release_id,fingerprint),
 foreign key(assessment_id,release_id,workspace_id,project_id,environment_id,api_import_id) references public.release_assessments(id,release_id,workspace_id,project_id,environment_id,api_import_id),
 foreign key(decision_id,assessment_id,release_id,workspace_id,project_id,environment_id,api_import_id) references public.release_decisions(id,assessment_id,release_id,workspace_id,project_id,environment_id,api_import_id)
);
alter table public.releases add foreign key(assessment_id,id,workspace_id,project_id,environment_id,api_import_id) references public.release_assessments(id,release_id,workspace_id,project_id,environment_id,api_import_id);
alter table public.releases add foreign key(decision_id,id,workspace_id,project_id,environment_id,api_import_id) references public.release_decisions(id,release_id,workspace_id,project_id,environment_id,api_import_id);
create table public.release_audit_events (
 id uuid primary key default gen_random_uuid(),release_id uuid not null,workspace_id uuid not null,project_id uuid not null,environment_id uuid not null,api_import_id uuid not null,
 assessment_id uuid,decision_id uuid,report_id uuid,
 event text not null check(event in ('RELEASE_CREATED','RELEASE_ASSESSED','RELEASE_DECISION_RECORDED','RELEASE_REPORT_GENERATED')),actor_id uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(release_id,workspace_id,project_id,environment_id,api_import_id) references public.releases(id,workspace_id,project_id,environment_id,api_import_id),
 foreign key(assessment_id,release_id,workspace_id,project_id,environment_id,api_import_id) references public.release_assessments(id,release_id,workspace_id,project_id,environment_id,api_import_id),
 foreign key(decision_id,release_id,workspace_id,project_id,environment_id,api_import_id) references public.release_decisions(id,release_id,workspace_id,project_id,environment_id,api_import_id),
 foreign key(report_id,release_id,workspace_id,project_id,environment_id,api_import_id) references public.release_reports(id,release_id,workspace_id,project_id,environment_id,api_import_id),
 check((event='RELEASE_CREATED' and assessment_id is null and decision_id is null and report_id is null) or (event='RELEASE_ASSESSED' and assessment_id is not null and decision_id is null and report_id is null) or (event='RELEASE_DECISION_RECORDED' and decision_id is not null and assessment_id is null and report_id is null) or (event='RELEASE_REPORT_GENERATED' and report_id is not null and assessment_id is null and decision_id is null))
);
create index release_history on public.releases(workspace_id,project_id,created_at desc,id);
create index release_assessment_history on public.release_assessments(release_id,assessed_at desc,id);
create index release_decision_history on public.release_decisions(release_id,revision desc);
create index release_report_history on public.release_reports(workspace_id,project_id,generated_at desc,id);
create index release_audit_history on public.release_audit_events(release_id,created_at,id);
-- Read-only membership access; all writes are controlled RPCs.
alter table public.releases enable row level security;
alter table public.release_assessments enable row level security;
alter table public.release_decisions enable row level security;
alter table public.release_reports enable row level security;
alter table public.release_audit_events enable row level security;
create policy releases_read on public.releases for select to authenticated using(public.is_workspace_member(workspace_id));
create policy release_assessments_read on public.release_assessments for select to authenticated using(public.is_workspace_member(workspace_id));
create policy release_decisions_read on public.release_decisions for select to authenticated using(public.is_workspace_member(workspace_id));
create policy release_reports_read on public.release_reports for select to authenticated using(public.is_workspace_member(workspace_id));
create policy release_audit_read on public.release_audit_events for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.releases,public.release_assessments,public.release_decisions,public.release_reports,public.release_audit_events from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.releases,public.release_assessments,public.release_decisions,public.release_reports,public.release_audit_events to authenticated;

-- Membership -> project -> release is the common lock order for every mutation.
create function public.release_scope(project_input uuid,environment_input uuid) returns uuid language plpgsql set search_path='' set timezone='UTC' as $$
declare workspace uuid;
begin
 workspace:=public.intelligence_scope(project_input,environment_input);
 perform 1 from public.workspace_members where workspace_id=workspace and user_id=auth.uid() and role in ('OWNER','ADMIN') for share;
 if not found then raise exception 'Release authority required' using errcode='42501';end if;
 return workspace;
end;$$;
create function public.release_lock(release_input uuid) returns public.releases language plpgsql set search_path='' set timezone='UTC' as $$
declare r public.releases%rowtype;
begin
 select * into r from public.releases where id=release_input;
 if r.id is null then raise exception 'Release unavailable' using errcode='42501';end if;
 perform public.release_scope(r.project_id,r.environment_id);
 select * into r from public.releases where id=release_input for update;
 return r;
end;$$;
create function public.release_audit(r public.releases,event_input text,target_input uuid default null) returns void language sql set search_path='' set timezone='UTC' as $$
 insert into public.release_audit_events(release_id,workspace_id,project_id,environment_id,api_import_id,event,actor_id,assessment_id,decision_id,report_id) values(r.id,r.workspace_id,r.project_id,r.environment_id,r.api_import_id,event_input,auth.uid(),case when event_input='RELEASE_ASSESSED' then target_input end,case when event_input='RELEASE_DECISION_RECORDED' then target_input end,case when event_input='RELEASE_REPORT_GENERATED' then target_input end);
$$;
create function public.create_release(project_input uuid,environment_input uuid,name_input text) returns uuid language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare workspace uuid;source uuid;r public.releases%rowtype;
begin
 workspace:=public.release_scope(project_input,environment_input);
 if name_input is null or length(btrim(name_input)) not between 1 and 120 or public.release_text_safe(name_input,120) is distinct from true then raise exception 'Unsafe release identity' using errcode='23514';end if;
 if (select count(*) from public.releases where project_id=project_input)>=500 then raise exception 'Release capacity reached' using errcode='23514';end if;
 select id into source from public.api_imports where project_id=project_input order by created_at desc,id desc limit 1;
 if source is null then raise exception 'Import an API before creating a release' using errcode='23514';end if;
 insert into public.releases(workspace_id,project_id,environment_id,api_import_id,name,created_by) values(workspace,project_input,environment_input,source,btrim(name_input),auth.uid()) returning * into r;
 perform public.release_audit(r,'RELEASE_CREATED');return r.id;
end;$$;
-- One statement snapshot. Never copy operation names, QA prose, finding notes or payloads.
create function public.release_inputs(r public.releases,quality_input uuid) returns jsonb language sql stable set search_path='' set timezone='UTC' as $$
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
'memory',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'currentness',m.currentness,'count',m.observation_count,'caseId',m.case_id,'packageId',m.first_package_id,'observationIds',coalesce((select jsonb_agg(o.id order by o.id) from public.memory_observations o where o.fact_id=m.id),'[]'::jsonb),'runIds',coalesce((select jsonb_agg(distinct o.run_id order by o.run_id) from public.memory_observations o where o.fact_id=m.id),'[]'::jsonb),'packageIds',coalesce((select jsonb_agg(distinct o.package_id order by o.package_id) from public.memory_observations o where o.fact_id=m.id),'[]'::jsonb)) order by m.id) from public.project_memory m where m.project_id=r.project_id and m.environment_id=r.environment_id and m.api_import_id=r.api_import_id),'[]'::jsonb));
$$;
create function public.compute_release_policy(input jsonb) returns jsonb language plpgsql immutable set search_path='' set timezone='UTC' as $$
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
 status_value:=case when jsonb_array_length(blockers)>0 then 'BLOCKED' when jsonb_array_length(unknowns)>0 then 'INSUFFICIENT_EVIDENCE' when jsonb_array_length(warnings)>0 then 'CAUTION' else 'CLEAR' end;
 return jsonb_build_object('policyVersion','release-policy-v1','status',status_value,'blockers',blockers,'warnings',warnings,'unknowns',unknowns,'inputs',input);
end;$$;
create function public.assess_release(release_input uuid) returns uuid language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r public.releases%rowtype;quality uuid;input jsonb;computed jsonb;signature text;result_id uuid;attempt integer;
begin
 r:=public.release_lock(release_input);
 for attempt in 1..3 loop
 quality:=null;
 if r.api_import_id=(select id from public.api_imports where project_id=r.project_id order by created_at desc,id desc limit 1) then quality:=public.assess_project_quality(r.project_id,r.environment_id);end if;
 input:=public.release_inputs(r,quality);
 if input->'qualityStateMatches'='true'::jsonb then exit;end if;
 if attempt=3 then raise exception 'Evidence changed; retry assessment' using errcode='40001';end if;
 end loop;
 input:=input-'qualityStateMatches';
 if input->'sourceCurrent'='false'::jsonb then quality:=null;input:=jsonb_set(input,'{quality}','null');end if;
 if octet_length(input::text)>1800000 or exists(select 1 from jsonb_each(input) e where case when jsonb_typeof(e.value)='array' then jsonb_array_length(e.value)>10000 else false end) then raise exception 'Release input capacity reached' using errcode='23514';end if;
 computed:=public.compute_release_policy(input);
 signature:=encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_array('release-policy-v1',r.id,r.workspace_id,r.project_id,r.environment_id,r.api_import_id,input)::text,'UTF8')),'hex');
 insert into public.release_assessments(release_id,workspace_id,project_id,environment_id,api_import_id,quality_assessment_id,policy_version,fingerprint,result,created_by)
 values(r.id,r.workspace_id,r.project_id,r.environment_id,r.api_import_id,quality,'release-policy-v1',signature,computed,auth.uid()) on conflict(release_id,fingerprint) do nothing returning id into result_id;
 if result_id is null then select id into result_id from public.release_assessments where release_id=r.id and fingerprint=signature;end if;
 if r.assessment_id is distinct from result_id then update public.releases set assessment_id=result_id where id=r.id;perform public.release_audit(r,'RELEASE_ASSESSED',result_id);end if;
 return result_id;
end;$$;
create function public.decide_release(release_input uuid,assessment_input uuid,expected_decision uuid,decision_input text,rationale_input text) returns uuid language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r public.releases%rowtype;a public.release_assessments%rowtype;result_id uuid;
begin
 r:=public.release_lock(release_input);
 if r.decision_id is distinct from expected_decision or r.assessment_id is distinct from assessment_input then raise exception 'Stale release decision' using errcode='40001';end if;
 if public.assess_release(r.id) is distinct from assessment_input then raise exception 'Evidence changed; refresh before deciding' using errcode='40001';end if;
 select * into a from public.release_assessments where id=assessment_input and release_id=r.id;
 if decision_input is null or decision_input not in ('APPROVE','APPROVE_WITH_RISK','REJECT') or rationale_input is null or length(rationale_input)>1000 or public.release_text_safe(rationale_input,1000) is distinct from true then raise exception 'Invalid human decision' using errcode='23514';end if;
 if decision_input='APPROVE' and a.result->>'status'<>'CLEAR' then raise exception 'Use explicit approval with risk' using errcode='23514';end if;
 if decision_input in ('APPROVE_WITH_RISK','REJECT') and length(btrim(rationale_input))=0 then raise exception 'Decision rationale required' using errcode='23514';end if;
 insert into public.release_decisions(release_id,workspace_id,project_id,environment_id,api_import_id,assessment_id,revision,decision,rationale,is_override,actor_id)
 values(r.id,r.workspace_id,r.project_id,r.environment_id,r.api_import_id,a.id,r.decision_revision+1,decision_input,btrim(rationale_input),decision_input='APPROVE_WITH_RISK' and a.result->>'status'<>'CLEAR',auth.uid()) returning id into result_id;
 update public.releases set decision_id=result_id,decision_revision=decision_revision+1 where id=r.id;
 perform public.release_audit(r,'RELEASE_DECISION_RECORDED',result_id);return result_id;
end;$$;
create function public.generate_release_report(release_input uuid,assessment_input uuid) returns uuid language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r public.releases%rowtype;a public.release_assessments%rowtype;d public.release_decisions%rowtype;signature text;body jsonb;result_id uuid;
begin
 r:=public.release_lock(release_input);
 select * into a from public.release_assessments where id=assessment_input and release_id=r.id;
 if a.id is null then raise exception 'Assessment unavailable' using errcode='42501';end if;
 select * into d from public.release_decisions where assessment_id=a.id and release_id=r.id order by revision desc limit 1;
 signature:=encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_array('release-report-v1',r.id,a.id,a.fingerprint,d.id)::text,'UTF8')),'hex');
 body:=jsonb_build_object('reportVersion','release-report-v1','release',jsonb_build_object('id',r.id,'name',r.name,'workspace_id',r.workspace_id,'project_id',r.project_id,'environment_id',r.environment_id,'api_import_id',r.api_import_id),'environmentType',(select type from public.environments where id=r.environment_id),'assessment',to_jsonb(a),'decision',case when d.id is null then 'null'::jsonb else to_jsonb(d) end);
 insert into public.release_reports(release_id,workspace_id,project_id,environment_id,api_import_id,assessment_id,decision_id,report_version,fingerprint,snapshot,generated_by)
 values(r.id,r.workspace_id,r.project_id,r.environment_id,r.api_import_id,a.id,d.id,'release-report-v1',signature,body,auth.uid()) on conflict(release_id,fingerprint) do nothing returning id into result_id;
 if result_id is null then select id into result_id from public.release_reports where release_id=r.id and fingerprint=signature;else perform public.release_audit(r,'RELEASE_REPORT_GENERATED',result_id);end if;
 return result_id;
end;$$;
revoke all on function public.release_scope(uuid,uuid),public.release_lock(uuid),public.release_audit(public.releases,text,uuid),public.release_inputs(public.releases,uuid),public.compute_release_policy(jsonb) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.create_release(uuid,uuid,text),public.assess_release(uuid),public.decide_release(uuid,uuid,uuid,text,text),public.generate_release_report(uuid,uuid) from public,anon,authenticated,service_role,testpilot_runner;
grant execute on function public.create_release(uuid,uuid,text),public.assess_release(uuid),public.decide_release(uuid,uuid,uuid,text,text),public.generate_release_report(uuid,uuid) to authenticated;
select public.validate_execution_runner_role();
commit;
