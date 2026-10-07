begin;
-- New composite key binds evidence to the complete immutable execution scope.
alter table public.execution_runs add constraint evidence_run_scope unique(id,workspace_id,project_id,environment_id,config_id,plan_id,case_id,scenario_id);
create table public.evidence_packages (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,project_id uuid not null,environment_id uuid not null,
 run_id uuid not null unique references public.execution_results(run_id),config_id uuid not null,plan_id uuid not null,case_id uuid not null,scenario_id uuid not null,
 version text not null default '1' check(version='1'),fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),created_at timestamptz not null default clock_timestamp(),
 unique(id,workspace_id,project_id),unique(id,workspace_id,project_id,environment_id,case_id),
 foreign key(run_id,workspace_id,project_id,environment_id,config_id,plan_id,case_id,scenario_id) references public.execution_runs(id,workspace_id,project_id,environment_id,config_id,plan_id,case_id,scenario_id)
);
create table public.evidence_items (
 id uuid primary key default gen_random_uuid(),package_id uuid not null,workspace_id uuid not null,project_id uuid not null,
 kind text not null check(kind in ('REQUEST_SUMMARY','RESPONSE_SUMMARY','ASSERTION_RESULT','TIMING','EXECUTION_FAILURE','SAFETY_DECISION')),
 assertion_index integer check(assertion_index between 0 and 29),
 check((kind='ASSERTION_RESULT' and assertion_index is not null) or (kind<>'ASSERTION_RESULT' and assertion_index is null)),
 unique(package_id,kind,assertion_index),foreign key(package_id,workspace_id,project_id) references public.evidence_packages(id,workspace_id,project_id)
);
create unique index evidence_single_item on public.evidence_items(package_id,kind) where assertion_index is null;
create table public.findings (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,project_id uuid not null,environment_id uuid not null,case_id uuid not null,first_package_id uuid not null,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),rule text not null check(rule in ('ASSERTION_FAILED','EXECUTION_TIMEOUT','TRANSPORT_FAILURE')),assertion_key text not null check(assertion_key ~ '^[a-f0-9]{64}$'),
 title text not null check(length(title) between 1 and 160),summary text not null check(length(summary) between 1 and 2000),
 severity text not null check(severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),confidence text not null check(confidence in ('LOW','MEDIUM','HIGH')),
 status text not null default 'CANDIDATE' check(status in ('CANDIDATE','CONFIRMED','DISMISSED')),source text not null default 'DETERMINISTIC' check(source='DETERMINISTIC'),
 revision integer not null default 0 check(revision>=0),occurrence_count integer not null default 1 check(occurrence_count>0),first_observed_at timestamptz not null,last_observed_at timestamptz not null,
 unique(workspace_id,project_id,fingerprint),unique(id,workspace_id,project_id,environment_id,case_id),unique(id,workspace_id,project_id),
 foreign key(first_package_id,workspace_id,project_id,environment_id,case_id) references public.evidence_packages(id,workspace_id,project_id,environment_id,case_id)
);
create table public.finding_occurrences (
 id uuid primary key default gen_random_uuid(),finding_id uuid not null,package_id uuid not null,workspace_id uuid not null,project_id uuid not null,environment_id uuid not null,case_id uuid not null,
 assertion_index integer check(assertion_index between 0 and 29),observed_at timestamptz not null,
 unique(finding_id,package_id),foreign key(finding_id,workspace_id,project_id,environment_id,case_id) references public.findings(id,workspace_id,project_id,environment_id,case_id),
 foreign key(package_id,workspace_id,project_id,environment_id,case_id) references public.evidence_packages(id,workspace_id,project_id,environment_id,case_id)
);
create table public.finding_reviews (
 id uuid primary key default gen_random_uuid(),finding_id uuid not null,workspace_id uuid not null,project_id uuid not null,actor_id uuid not null references auth.users(id),
 revision integer not null check(revision>0),decision text not null check(decision in ('CONFIRM','DISMISS')),
 previous_status text not null check(previous_status='CANDIDATE'),new_status text not null check(new_status in ('CONFIRMED','DISMISSED')),
 previous_severity text not null check(previous_severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),new_severity text not null check(new_severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
 note text not null check(length(note)<=1000),created_at timestamptz not null default clock_timestamp(),unique(finding_id,revision),
 check((decision='CONFIRM' and new_status='CONFIRMED') or (decision='DISMISS' and new_status='DISMISSED')),
 foreign key(finding_id,workspace_id,project_id) references public.findings(id,workspace_id,project_id)
);
create table public.finding_audit_events (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,project_id uuid not null,package_id uuid not null,finding_id uuid,actor_id uuid not null references auth.users(id),
 event text not null check(event in ('EVIDENCE_DERIVED','FINDING_CREATED','FINDING_OBSERVED_AGAIN','FINDING_CONFIRMED','FINDING_DISMISSED','FINDING_SEVERITY_CHANGED')),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(package_id,workspace_id,project_id) references public.evidence_packages(id,workspace_id,project_id),foreign key(finding_id,workspace_id,project_id) references public.findings(id,workspace_id,project_id)
);
create index evidence_project_history on public.evidence_packages(workspace_id,project_id,created_at desc,id);
create index finding_project_history on public.findings(workspace_id,project_id,last_observed_at desc,id);
create index finding_filter on public.findings(workspace_id,project_id,status,severity,last_observed_at desc,id);
create index occurrence_history on public.finding_occurrences(finding_id,observed_at desc,id);
create index occurrence_package on public.finding_occurrences(package_id,finding_id);
create index finding_review_history on public.finding_reviews(finding_id,revision);
create index finding_audit_history on public.finding_audit_events(workspace_id,project_id,created_at);
alter table public.evidence_packages enable row level security;
create policy evidence_packages_read on public.evidence_packages for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.evidence_packages from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.evidence_packages to authenticated;
alter table public.evidence_items enable row level security;
create policy evidence_items_read on public.evidence_items for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.evidence_items from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.evidence_items to authenticated;
alter table public.findings enable row level security;
create policy findings_read on public.findings for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.findings from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.findings to authenticated;
alter table public.finding_occurrences enable row level security;
create policy finding_occurrences_read on public.finding_occurrences for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.finding_occurrences from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.finding_occurrences to authenticated;
alter table public.finding_reviews enable row level security;
create policy finding_reviews_read on public.finding_reviews for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.finding_reviews from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.finding_reviews to authenticated;
alter table public.finding_audit_events enable row level security;
create policy finding_audit_events_read on public.finding_audit_events for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.finding_audit_events from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.finding_audit_events to authenticated;
-- Ordinary clients cannot rewrite source results or package/item/occurrence history.
create function public.derive_execution_evidence(run_input uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.execution_runs%rowtype;v jsonb;p uuid;f uuid;found_new boolean;added integer;a jsonb;idx integer;rule_code text;key_hash text;signature text;severity_value text;confidence_value text;caller uuid:=auth.uid();observed timestamptz;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into r from public.execution_runs where id=run_input for share;
 if r.id is null then raise exception 'Unavailable' using errcode='42501';end if;
 perform 1 from public.workspace_members where workspace_id=r.workspace_id and user_id=caller for share;
 if not found then raise exception 'Unavailable' using errcode='42501';end if;
 -- Locking the canonical persisted result serializes concurrent idempotent derivation.
 select result into v from public.execution_results where run_id=r.id and workspace_id=r.workspace_id for update;
 if v is null or r.status not in ('COMPLETED','ERROR','BLOCKED','CANCELLED') or r.completed_at is null or public.execution_result_safe(v) is distinct from true then raise exception 'No valid persisted terminal result' using errcode='23514';end if;
 select id into p from public.evidence_packages where run_id=r.id;
 if p is not null then return p;end if;
 observed:=r.completed_at;
 insert into public.evidence_packages(workspace_id,project_id,environment_id,run_id,config_id,plan_id,case_id,scenario_id,fingerprint)
 values(r.workspace_id,r.project_id,r.environment_id,r.id,r.config_id,r.plan_id,r.case_id,r.scenario_id,
 encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object('version','1','run',r.id,'workspace',r.workspace_id,'project',r.project_id,'environment',r.environment_id,'plan',r.plan_id,'scenario',r.scenario_id,'case',r.case_id,'config',r.config_id,'safety',jsonb_build_object('decision',r.decision,'policy',r.policy_version,'codes',r.reason_codes,'facts',r.facts),'caseReview',r.case_review_id,'scenarioReview',r.scenario_review_id,'request',r.request,'requestFingerprint',r.fingerprint,'result',v,'completed',to_char(r.completed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text,'UTF8')),'hex')) returning id into p;
 insert into public.evidence_items(package_id,workspace_id,project_id,kind) values(p,r.workspace_id,r.project_id,'SAFETY_DECISION');
 if r.request is not null then insert into public.evidence_items(package_id,workspace_id,project_id,kind) values(p,r.workspace_id,r.project_id,'REQUEST_SUMMARY');end if;
 if v->'response'<>'null'::jsonb then
 insert into public.evidence_items(package_id,workspace_id,project_id,kind) values(p,r.workspace_id,r.project_id,'RESPONSE_SUMMARY'),(p,r.workspace_id,r.project_id,'TIMING');end if;
 if v->'failure'<>'null'::jsonb then insert into public.evidence_items(package_id,workspace_id,project_id,kind) values(p,r.workspace_id,r.project_id,'EXECUTION_FAILURE');end if;
 for a,idx in select value,(ordinality-1)::integer from jsonb_array_elements(v->'assertions') with ordinality loop
 insert into public.evidence_items(package_id,workspace_id,project_id,kind,assertion_index) values(p,r.workspace_id,r.project_id,'ASSERTION_RESULT',idx);
 end loop;
 insert into public.finding_audit_events(workspace_id,project_id,package_id,actor_id,event) values(r.workspace_id,r.project_id,p,caller,'EVIDENCE_DERIVED');
 -- Assertion failures are candidates. Infrastructure observations are explicitly not API defects.
 for a,idx in select value,(ordinality-1)::integer from jsonb_array_elements(v->'assertions') with ordinality where value->>'status'='FAIL' and v->>'outcome'='FAILED'
 union all select jsonb_build_object('failure',v->>'failure'),null::integer where v->>'outcome'='ERROR' and v->>'failure' in ('TIMEOUT','CONNECTION_TIMEOUT','TRANSPORT_FAILURE') loop
 rule_code:=case when idx is not null then 'ASSERTION_FAILED' when v->>'failure'='TRANSPORT_FAILURE' then 'TRANSPORT_FAILURE' else 'EXECUTION_TIMEOUT' end;
 severity_value:=case when idx is not null then 'MEDIUM' else 'INFO' end;
 confidence_value:=case when idx is not null then 'HIGH' when rule_code='TRANSPORT_FAILURE' then 'LOW' else 'MEDIUM' end;
 key_hash:=encode(pg_catalog.sha256(pg_catalog.convert_to((a-array['status','actual','reason'])::text,'UTF8')),'hex');
 signature:=encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_array(r.project_id,r.environment_id,r.case_id,r.fingerprint,rule_code,key_hash)::text,'UTF8')),'hex');
 f:=null;
 insert into public.findings(workspace_id,project_id,environment_id,case_id,first_package_id,fingerprint,rule,assertion_key,title,summary,severity,confidence,first_observed_at,last_observed_at)
 values(r.workspace_id,r.project_id,r.environment_id,r.case_id,p,signature,rule_code,key_hash,
 case rule_code when 'ASSERTION_FAILED' then 'Declared response assertion failed' when 'EXECUTION_TIMEOUT' then 'Execution timed out' else 'Execution transport failed' end,
 case when idx is not null then 'Observed response did not satisfy an approved assertion. Human review is required to confirm a defect.' else 'Execution infrastructure observation. This does not establish an API defect; investigate the supporting evidence.' end,
 severity_value,confidence_value,observed,observed) on conflict(workspace_id,project_id,fingerprint) do nothing returning id into f;
 found_new:=f is not null;
 if not found_new then select id into f from public.findings where workspace_id=r.workspace_id and project_id=r.project_id and fingerprint=signature for update;end if;
 insert into public.finding_occurrences(finding_id,package_id,workspace_id,project_id,environment_id,case_id,assertion_index,observed_at)
 values(f,p,r.workspace_id,r.project_id,r.environment_id,r.case_id,idx,observed) on conflict(finding_id,package_id) do nothing;
 get diagnostics added=row_count;
 if not found_new and added=1 then update public.findings set occurrence_count=occurrence_count+1,first_observed_at=least(first_observed_at,observed),last_observed_at=greatest(last_observed_at,observed) where id=f;end if;
 if added=1 then insert into public.finding_audit_events(workspace_id,project_id,package_id,finding_id,actor_id,event) values(r.workspace_id,r.project_id,p,f,caller,case when found_new then 'FINDING_CREATED' else 'FINDING_OBSERVED_AGAIN' end);end if;
 end loop;
 return p;
end;$$;
create function public.review_finding(finding_input uuid,revision_input integer,decision_input text,severity_input text,note_input text) returns uuid language plpgsql security definer set search_path='' as $$
declare f public.findings%rowtype;caller uuid:=auth.uid();review_id uuid;next_status text;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into f from public.findings where id=finding_input for update;
 if f.id is null then raise exception 'Unavailable' using errcode='42501';end if;
 perform 1 from public.workspace_members where workspace_id=f.workspace_id and user_id=caller for share;
 if not found then raise exception 'Unavailable' using errcode='42501';end if;
 if revision_input is distinct from f.revision or f.status<>'CANDIDATE' then raise exception 'Review changed or already completed' using errcode='40001';end if;
 if decision_input is null or decision_input not in ('CONFIRM','DISMISS') or severity_input is null or severity_input not in ('INFO','LOW','MEDIUM','HIGH','CRITICAL') or note_input is null or length(note_input)>1000 or note_input ~* '-----BEGIN|sb_secret_|eyJ[A-Za-z0-9_-]{15,}\.|(?:authorization|proxy-authorization)\s*:|bearer\s+[A-Za-z0-9._~+/-]+=*|[a-z][a-z0-9+.-]*://[^\s/@:]+:[^\s/@]+@|(?:password|passwd|access[_-]?token|token|secret|api.?key|apikey|client[_-]?secret|cookie|credential|session)\s*[:=]' then raise exception 'Invalid bounded review' using errcode='23514';end if;
 next_status:=case when decision_input='CONFIRM' then 'CONFIRMED' else 'DISMISSED' end;
 insert into public.finding_reviews(finding_id,workspace_id,project_id,actor_id,revision,decision,previous_status,new_status,previous_severity,new_severity,note)
 values(f.id,f.workspace_id,f.project_id,caller,f.revision+1,decision_input,f.status,next_status,f.severity,severity_input,btrim(note_input)) returning id into review_id;
 update public.findings set status=next_status,severity=severity_input,revision=revision+1 where id=f.id;
 insert into public.finding_audit_events(workspace_id,project_id,package_id,finding_id,actor_id,event) values(f.workspace_id,f.project_id,f.first_package_id,f.id,caller,case when next_status='CONFIRMED' then 'FINDING_CONFIRMED' else 'FINDING_DISMISSED' end);
 if f.severity<>severity_input then insert into public.finding_audit_events(workspace_id,project_id,package_id,finding_id,actor_id,event) values(f.workspace_id,f.project_id,f.first_package_id,f.id,caller,'FINDING_SEVERITY_CHANGED');end if;
 return review_id;
end;$$;
revoke all on function public.derive_execution_evidence(uuid),public.review_finding(uuid,integer,text,text,text) from public,anon,authenticated,service_role,testpilot_runner;
grant execute on function public.derive_execution_evidence(uuid),public.review_finding(uuid,integer,text,text,text) to authenticated;
-- Assert the deployed worker boundary remains unchanged after adding M1.8.
select public.validate_execution_runner_role();
commit;
