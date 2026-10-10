begin;
-- Curiosity owns investigation metadata, never transport or runner authority.
-- Candidate keys strengthen references without changing prior access policies.
alter table public.execution_runs add constraint curiosity_run_scope unique(id,workspace_id,project_id,environment_id,case_id);
alter table public.evidence_packages add constraint curiosity_result_scope unique(id,run_id,workspace_id,project_id);
alter table public.evidence_items add constraint curiosity_item_scope unique(id,package_id,workspace_id,project_id);
create table public.investigations (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null,
 environment_id uuid not null, source_case_id uuid not null, source_package_id uuid not null, source_finding_id uuid,
 trigger text not null check(trigger in ('FINDING','FAILED_ASSERTION','UNEXPECTED_RESPONSE','INFRASTRUCTURE_OBSERVATION','MANUAL_INVESTIGATION_REQUEST')),
 status text not null default 'OPEN' check(status in ('OPEN','WAITING_FOR_APPROVAL','RUNNING','CONCLUDED','STOPPED')),
 revision integer not null default 0 check(revision>=0), created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '1 hour', created_by uuid not null references auth.users(id),
 conclusion text check(conclusion in ('HYPOTHESIS_SUPPORTED','HYPOTHESIS_NOT_SUPPORTED','INCONCLUSIVE','STOPPED_BY_POLICY','BUDGET_EXHAUSTED')),
 conclusion_package_id uuid,
 unique(id,workspace_id,project_id), unique(id,workspace_id,project_id,environment_id), unique(source_package_id),
 check(expires_at>created_at and expires_at<=created_at+interval '1 hour 1 second'),
 check((status in ('CONCLUDED','STOPPED'))=(conclusion is not null)),
 foreign key(source_package_id,workspace_id,project_id) references public.evidence_packages(id,workspace_id,project_id),
 foreign key(source_finding_id,workspace_id,project_id) references public.findings(id,workspace_id,project_id),
 foreign key(conclusion_package_id,workspace_id,project_id) references public.evidence_packages(id,workspace_id,project_id),
 foreign key(project_id,workspace_id) references public.projects(id,workspace_id),
 foreign key(source_package_id,workspace_id,project_id,environment_id,source_case_id) references public.evidence_packages(id,workspace_id,project_id,environment_id,case_id)
);
create table public.investigation_proposals (
 id uuid primary key default gen_random_uuid(), investigation_id uuid not null, workspace_id uuid not null, project_id uuid not null,
 environment_id uuid not null, case_id uuid not null, plan_id uuid not null, qa_analysis_id uuid not null, case_review_id uuid not null references public.test_reviews(id), scenario_review_id uuid not null references public.test_reviews(id),
 graph_id uuid not null, api_import_id uuid not null, operation_id text not null, dependency_id uuid,
 depth integer not null check(depth between 0 and 2), payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=8000),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'), approved_fingerprint text,
 status text not null default 'PROPOSED' check(status in ('PROPOSED','APPROVED','REJECTED','BLOCKED','MATERIALIZED','EXECUTED')),
 revision integer not null default 0 check(revision>=0), approved_by uuid references auth.users(id), created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 run_id uuid unique, result_package_id uuid, execution_case_id uuid, observed_status integer check(observed_status between 100 and 599),
 unique(investigation_id,fingerprint),unique(id,investigation_id,workspace_id,project_id),
 check(approved_fingerprint is null or approved_fingerprint=fingerprint),
 check(status not in ('APPROVED','MATERIALIZED','EXECUTED') or approved_fingerprint is not null),
 check(status not in ('PROPOSED','REJECTED') or approved_fingerprint is null),
 check(status not in ('MATERIALIZED','EXECUTED') or run_id is not null),
 check(run_id is null or status in ('MATERIALIZED','EXECUTED','BLOCKED')),
 check((run_id is null)=(execution_case_id is null)),
 foreign key(execution_case_id,plan_id,qa_analysis_id,workspace_id) references public.test_items(id,plan_id,qa_analysis_id,workspace_id),
 check((status='EXECUTED')=(result_package_id is not null)),
 foreign key(investigation_id,workspace_id,project_id) references public.investigations(id,workspace_id,project_id),
 foreign key(dependency_id,investigation_id,workspace_id,project_id) references public.investigation_proposals(id,investigation_id,workspace_id,project_id),
 foreign key(case_id,plan_id,qa_analysis_id,workspace_id) references public.test_items(id,plan_id,qa_analysis_id,workspace_id),
 foreign key(plan_id,graph_id,api_import_id,project_id,workspace_id) references public.test_plans(id,behaviour_graph_id,api_import_id,project_id,workspace_id),
 foreign key(graph_id,operation_id,api_import_id,project_id,workspace_id) references public.behaviour_graph_nodes(graph_id,logical_id,api_import_id,project_id,workspace_id),
 foreign key(investigation_id,workspace_id,project_id,environment_id) references public.investigations(id,workspace_id,project_id,environment_id),
 foreign key(run_id,workspace_id,project_id,environment_id,execution_case_id) references public.execution_runs(id,workspace_id,project_id,environment_id,case_id),
 foreign key(result_package_id,run_id,workspace_id,project_id) references public.evidence_packages(id,run_id,workspace_id,project_id)
);
create table public.investigation_citations (
 proposal_id uuid not null, investigation_id uuid not null, workspace_id uuid not null, project_id uuid not null,
 evidence_item_id uuid not null, package_id uuid not null,
 primary key(proposal_id,evidence_item_id),
 foreign key(evidence_item_id,package_id,workspace_id,project_id) references public.evidence_items(id,package_id,workspace_id,project_id),
 foreign key(proposal_id,investigation_id,workspace_id,project_id) references public.investigation_proposals(id,investigation_id,workspace_id,project_id),
 foreign key(package_id,workspace_id,project_id) references public.evidence_packages(id,workspace_id,project_id)
);
create table public.investigation_audit_events (
 id uuid primary key default gen_random_uuid(), investigation_id uuid not null, workspace_id uuid not null, project_id uuid not null,
 proposal_id uuid, actor_id uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp(),
 event text not null check(event in ('INVESTIGATION_CREATED','PROPOSAL_CREATED','PROPOSAL_BLOCKED','PROPOSAL_APPROVED','PROPOSAL_REJECTED','PROPOSAL_MATERIALIZED','STEP_EXECUTED','INVESTIGATION_CONCLUDED','INVESTIGATION_STOPPED')),
 foreign key(investigation_id,workspace_id,project_id) references public.investigations(id,workspace_id,project_id),
 foreign key(proposal_id,investigation_id,workspace_id,project_id) references public.investigation_proposals(id,investigation_id,workspace_id,project_id)
);
create index investigation_history on public.investigations(workspace_id,project_id,created_at desc,id);
create index investigation_step_history on public.investigation_proposals(workspace_id,project_id,investigation_id,created_at,id);
create index investigation_citation_reverse on public.investigation_citations(evidence_item_id);
create index investigation_audit_history on public.investigation_audit_events(investigation_id,created_at,id);
alter table public.investigations enable row level security;
create policy investigations_read on public.investigations for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.investigations from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.investigations to authenticated;
alter table public.investigation_proposals enable row level security;
create policy investigation_proposals_read on public.investigation_proposals for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.investigation_proposals from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.investigation_proposals to authenticated;
alter table public.investigation_citations enable row level security;
create policy investigation_citations_read on public.investigation_citations for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.investigation_citations from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.investigation_citations to authenticated;
alter table public.investigation_audit_events enable row level security;
create policy investigation_audit_events_read on public.investigation_audit_events for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.investigation_audit_events from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.investigation_audit_events to authenticated;

-- All helper functions are private; privileged entry points lock membership and scope.
create function public.curiosity_lock(investigation_input uuid) returns public.investigations language plpgsql set search_path='' as $$
declare i public.investigations%rowtype;
begin
 if auth.uid() is null then raise exception 'Unavailable' using errcode='42501';end if;
 select * into i from public.investigations where id=investigation_input for update;
 if i.id is null then raise exception 'Unavailable' using errcode='42501';end if;
 perform 1 from public.workspace_members where workspace_id=i.workspace_id and user_id=auth.uid() for share;
 if not found then raise exception 'Unavailable' using errcode='42501';end if;return i;
end;$$;
create function public.curiosity_open(i public.investigations) returns void language plpgsql set search_path='' as $$
begin if i.status in ('CONCLUDED','STOPPED') or clock_timestamp()>=i.expires_at then raise exception 'Investigation closed or expired' using errcode='23514';end if;end;$$;
create function public.curiosity_operation(case_input uuid) returns text language sql stable set search_path='' as $$
 select min(n.node_id) from public.test_item_nodes n join public.behaviour_graph_nodes g on g.graph_id=n.behaviour_graph_id and g.logical_id=n.node_id
 join public.api_imports a on a.id=n.api_import_id
 where n.item_id=case_input and g.type='OPERATION'
 and exists(select 1 from jsonb_array_elements(a.knowledge->'operations') op where op->>'key'=g.logical_id::jsonb->>1 and public.execution_literal_safe(op->>'path'))
 having count(*)=1;
$$;
create function public.curiosity_case_in_scope(i public.investigations,case_input uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.test_items c join public.test_plans p on p.id=c.plan_id
 join public.evidence_packages e on e.id=i.source_package_id join public.execution_runs r on r.id=e.run_id
 where c.id=case_input and c.kind='CASE' and p.workspace_id=i.workspace_id and p.project_id=i.project_id and p.behaviour_graph_id=r.behaviour_graph_id
 and public.curiosity_operation(c.id) is not null
 and (public.curiosity_operation(c.id)=public.curiosity_operation(r.case_id) or exists(
 select 1 from public.behaviour_graph_edges edge where edge.graph_id=p.behaviour_graph_id and edge.type='OPERATION_PRECEDES_OPERATION' and edge.from_id=public.curiosity_operation(r.case_id) and edge.to_id=public.curiosity_operation(c.id))));
$$;
create function public.curiosity_audit(i public.investigations,proposal uuid,event_input text) returns void language sql set search_path='' as $$
 insert into public.investigation_audit_events(investigation_id,workspace_id,project_id,proposal_id,actor_id,event) values(i.id,i.workspace_id,i.project_id,proposal,auth.uid(),event_input);
$$;
create function public.derive_investigation(run_input uuid,finding_input uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.execution_runs%rowtype;package uuid;result uuid;trigger_value text;v jsonb;
begin
 if auth.uid() is null then raise exception 'Unavailable' using errcode='42501';end if;
 select * into r from public.execution_runs where id=run_input for share;
 perform 1 from public.workspace_members where workspace_id=r.workspace_id and user_id=auth.uid() for share;
 if not found then raise exception 'Unavailable' using errcode='42501';end if;
 package:=public.derive_execution_evidence(r.id);
 -- Source lock serializes idempotent creation; finding must actually occur in this package.
 perform 1 from public.evidence_packages where id=package for update;
 if finding_input is not null and not exists(select 1 from public.finding_occurrences where finding_id=finding_input and package_id=package and workspace_id=r.workspace_id and project_id=r.project_id) then raise exception 'Finding source mismatch' using errcode='23514';end if;
 select id into result from public.investigations where source_package_id=package;if result is not null then return result;end if;
 select er.result into v from public.execution_results er where run_id=r.id;
 trigger_value:=case when finding_input is not null then 'FINDING' when v->>'outcome'='FAILED' then 'FAILED_ASSERTION' when v->>'outcome'='ERROR' then 'INFRASTRUCTURE_OBSERVATION' else 'MANUAL_INVESTIGATION_REQUEST' end;
 insert into public.investigations(workspace_id,project_id,environment_id,source_case_id,source_package_id,source_finding_id,trigger,created_by) values(r.workspace_id,r.project_id,r.environment_id,r.case_id,package,finding_input,trigger_value,auth.uid()) returning id into result;
 perform public.curiosity_audit((select x from public.investigations x where id=result),null,'INVESTIGATION_CREATED');return result;
end;$$;
create function public.investigation_context(investigation_input uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.investigations%rowtype;
begin
 i:=public.curiosity_lock(investigation_input);
 return jsonb_build_object('audit',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'event',a.event,'actor_id',a.actor_id,'created_at',a.created_at) order by a.created_at,a.id) from public.investigation_audit_events a where investigation_id=i.id),'[]'::jsonb),'investigation',to_jsonb(i),'observedValues',coalesce((select jsonb_agg(jsonb_build_object('caseId',candidate.id,'evidenceItemId',e.id,'field','response.status','value',(r.result->'response'->>'status')::integer,'parameterPointer',param->>'sourcePointer'))
 from public.test_items candidate join public.test_plans plan on plan.id=candidate.plan_id join public.api_imports a on a.id=plan.api_import_id,
 lateral jsonb_array_elements(a.knowledge->'operations') op,lateral jsonb_array_elements(op->'parameters') param,
 public.evidence_items e join public.evidence_packages pkg on pkg.id=e.package_id join public.execution_results r on r.run_id=pkg.run_id
 where public.curiosity_case_in_scope(i,candidate.id) and op->>'key'=public.curiosity_operation(candidate.id)::jsonb->>1
 and e.kind='RESPONSE_SUMMARY' and (pkg.id=i.source_package_id or pkg.id in(select result_package_id from public.investigation_proposals where investigation_id=i.id and status='EXECUTED'))
 and pkg.environment_id=i.environment_id and r.result->'response'<>'null'::jsonb
 and param->>'location'='query' and param->>'name' in ('status','statusCode','status_code') and param->'schema'->>'type' in ('integer','number')
 and (not(param->'schema' ? 'enum') or param->'schema'->'enum' @> jsonb_build_array((r.result->'response'->>'status')::integer))),'[]'::jsonb),
 'cases',coalesce((select jsonb_agg(x) from (select c.id,public.curiosity_operation(c.id) operation,
 split_part((public.curiosity_operation(c.id)::jsonb->>1),' ',1) method,
 c.definition->'nodeRefs' "graphNodes",c.definition->'edgeRefs' "graphEdges",jsonb_build_array('DECLARED_CONTRACT') assertions,public.execution_planning_ready(c.id) executable
 from public.test_items c where public.curiosity_case_in_scope(i,c.id) order by c.id limit 100)x),'[]'::jsonb),
 'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind) order by e.id) from public.evidence_items e where e.package_id=i.source_package_id or e.package_id in (select result_package_id from public.investigation_proposals where investigation_id=i.id and status='EXECUTED')),'[]'::jsonb),
 'proposals',coalesce((select jsonb_agg(p.payload||jsonb_build_object('id',p.id,'investigation_id',p.investigation_id,'status',p.status,'fingerprint',p.fingerprint,'approved_fingerprint',p.approved_fingerprint,'approved_by',p.approved_by,'revision',p.revision,'operation_id',p.operation_id,'run_id',p.run_id,'result_package_id',p.result_package_id,'depth',p.depth) order by p.created_at,p.id) from public.investigation_proposals p where investigation_id=i.id),'[]'::jsonb));
end;$$;
-- One canonical identity covers immutable source, environment and captured reviews.
create function public.curiosity_fingerprint(i public.investigations,c public.test_items,plan public.test_plans,case_review uuid,scenario_review uuid,payload jsonb,observed integer) returns text language sql immutable set search_path='' as $$
 select encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_array(i.id,i.workspace_id,i.project_id,i.environment_id,
 c.id,c.scenario_id,c.definition,plan.id,plan.qa_analysis_id,plan.behaviour_graph_id,plan.api_import_id,case_review,scenario_review,
 (select jsonb_agg(value order by value::text collate "C") from jsonb_array_elements(payload->'evidenceItemIds')),payload->'dependencyId',payload->'bindings',observed)::text,'UTF8')),'hex');
$$;
create function public.persist_investigation_proposal(investigation_input uuid,payload_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.investigations%rowtype;p public.test_plans%rowtype;c public.test_items%rowtype;parent public.investigation_proposals%rowtype;ref jsonb;package uuid;result uuid;signature text;operation text;level_value integer:=0;key text;binding jsonb;observed integer;context jsonb;case_review uuid;scenario_review uuid;
begin
 i:=public.curiosity_lock(investigation_input);perform public.curiosity_open(i);
 if jsonb_typeof(payload_input) is distinct from 'object' or not(payload_input ?& array['caseId','hypothesis','rationale','confidence','evidenceItemIds','dependencyId','bindings']) or payload_input-array['caseId','hypothesis','rationale','confidence','evidenceItemIds','dependencyId','bindings']<>'{}'::jsonb or octet_length(payload_input::text)>8000 then raise exception 'Invalid proposal' using errcode='23514';end if;
 foreach key in array array['hypothesis','rationale'] loop
 if jsonb_typeof(payload_input->key) is distinct from 'string' or length(btrim(payload_input->>key)) not between 1 and 1000 or not public.execution_literal_safe(payload_input->>key) or payload_input->>key ~* 'https?://|<script|-----BEGIN|sb_secret_|eyJ[A-Za-z0-9_-]{15,}\.|(?:authorization|proxy-authorization)\s*:|bearer\s+[A-Za-z0-9._~+/-]+=*|[a-z][a-z0-9+.-]*://[^\s/@:]+:[^\s/@]+@|(?:password|passwd|access[_-]?token|token|secret|api.?key|apikey|client[_-]?secret|cookie|credential|session)\s*[:=]' then raise exception 'Unsafe proposal text' using errcode='23514';end if;end loop;
 if payload_input->>'hypothesis' is distinct from 'Repeat the selected case to assess its declared assertions.' then raise exception 'Unsupported hypothesis' using errcode='23514';end if;
 if jsonb_typeof(payload_input->'caseId') is distinct from 'string' or payload_input->>'confidence' is null or payload_input->>'confidence' not in ('LOW','MEDIUM','HIGH') or jsonb_typeof(payload_input->'bindings') is distinct from 'array' or jsonb_array_length(payload_input->'bindings')>1 or jsonb_typeof(payload_input->'evidenceItemIds') is distinct from 'array' or jsonb_array_length(payload_input->'evidenceItemIds') not between 1 and 10 or (select count(distinct value) from jsonb_array_elements(payload_input->'evidenceItemIds'))<>jsonb_array_length(payload_input->'evidenceItemIds') then raise exception 'Unsupported proposal fields' using errcode='23514';end if;
 select * into c from public.test_items where id=(payload_input->>'caseId')::uuid for share;
 select * into p from public.test_plans where id=c.plan_id;
 -- review_test_item locks its item FOR UPDATE; hold both case/scenario identities.
 perform 1 from public.test_items where id=c.scenario_id for share;
 select id into case_review from public.test_reviews where item_id=c.id order by revision desc limit 1;
 select id into scenario_review from public.test_reviews where item_id=c.scenario_id order by revision desc limit 1;
 if not public.curiosity_case_in_scope(i,c.id) or not public.execution_planning_ready(c.id) then raise exception 'Case not grounded or approved' using errcode='23514';end if;
 if payload_input->'dependencyId'<>'null'::jsonb then
 select * into parent from public.investigation_proposals where id=(payload_input->>'dependencyId')::uuid and investigation_id=i.id;
 if parent.id is null or parent.status<>'EXECUTED' then raise exception 'Dependency unavailable' using errcode='23514';end if;level_value:=parent.depth+1;
 elsif payload_input->'dependencyId' is distinct from 'null'::jsonb then raise exception 'Invalid dependency' using errcode='23514';end if;
 for ref in select value from jsonb_array_elements(payload_input->'evidenceItemIds') loop
 if jsonb_typeof(ref) is distinct from 'string' then raise exception 'Invalid citation' using errcode='23514';end if;
 select package_id into package from public.evidence_items where id=(ref#>>'{}')::uuid and workspace_id=i.workspace_id and project_id=i.project_id;
 if package is null or (package<>i.source_package_id and package is distinct from parent.result_package_id) then raise exception 'Citation out of scope' using errcode='23514';end if;
 end loop;
 context:=public.investigation_context(i.id);
 for binding in select value from jsonb_array_elements(payload_input->'bindings') loop
 if jsonb_typeof(binding) is distinct from 'object' or not(binding ?& array['parameterPointer','evidenceItemId','field']) or binding-array['parameterPointer','evidenceItemId','field']<>'{}'::jsonb or not(payload_input->'evidenceItemIds' ? (binding->>'evidenceItemId')) then raise exception 'Invalid observed binding' using errcode='23514';end if;
 select (o->>'value')::integer into observed from jsonb_array_elements(context->'observedValues') o where o->>'caseId'=c.id::text and o->>'evidenceItemId'=binding->>'evidenceItemId' and o->>'field'=binding->>'field' and o->>'parameterPointer'=binding->>'parameterPointer';
 if observed is null then raise exception 'Observed binding not eligible' using errcode='23514';end if;end loop;
 operation:=public.curiosity_operation(c.id);
 -- Equivalence excludes model prose/confidence and includes immutable case definition/reviews.
 signature:=public.curiosity_fingerprint(i,c,p,case_review,scenario_review,payload_input,observed);
 select id into result from public.investigation_proposals where investigation_id=i.id and fingerprint=signature;if result is not null then return result;end if;
 if level_value>2 or (select count(*) from public.investigation_proposals where investigation_id=i.id)>=8 or (select count(*) from public.investigation_proposals where investigation_id=i.id and operation_id=operation)>=2 or (select count(*) from public.investigation_proposals where investigation_id=i.id and run_id is not null)>=3 then raise exception 'Investigation budget exhausted' using errcode='23514';end if;
 insert into public.investigation_proposals(investigation_id,workspace_id,project_id,environment_id,case_id,plan_id,qa_analysis_id,case_review_id,scenario_review_id,graph_id,api_import_id,operation_id,dependency_id,depth,payload,fingerprint,created_by,observed_status)
 values(i.id,i.workspace_id,i.project_id,i.environment_id,c.id,p.id,p.qa_analysis_id,case_review,scenario_review,p.behaviour_graph_id,p.api_import_id,operation,parent.id,level_value,payload_input,signature,auth.uid(),observed) returning id into result;
 for ref in select value from jsonb_array_elements(payload_input->'evidenceItemIds') loop
 insert into public.investigation_citations(proposal_id,investigation_id,workspace_id,project_id,evidence_item_id,package_id) select result,i.id,i.workspace_id,i.project_id,e.id,e.package_id from public.evidence_items e where e.id=(ref#>>'{}')::uuid;
 end loop;
 update public.investigations set status='WAITING_FOR_APPROVAL',revision=revision+1 where id=i.id;
 perform public.curiosity_audit(i,result,'PROPOSAL_CREATED');return result;
end;$$;
create function public.decide_investigation_proposal(proposal_input uuid,revision_input integer,fingerprint_input text,approve_input boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.investigations%rowtype;p public.investigation_proposals%rowtype;
begin
 i:=public.curiosity_lock((select investigation_id from public.investigation_proposals where id=proposal_input));perform public.curiosity_open(i);
 perform 1 from public.workspace_members where workspace_id=i.workspace_id and user_id=auth.uid() and role in ('OWNER','ADMIN') for share;
 if not found then raise exception 'Approval permission required' using errcode='42501';end if;
 select * into p from public.investigation_proposals where id=proposal_input for update;
 if approve_input is null or fingerprint_input is distinct from p.fingerprint then raise exception 'Approval binding changed' using errcode='23514';end if;
 -- Identical retries are harmless; a competing opposite decision is a conflict.
 if p.status=(case when approve_input then 'APPROVED' else 'REJECTED' end) and revision_input=p.revision-1 then return p.id;end if;
 if p.status<>'PROPOSED' or revision_input is distinct from p.revision then raise exception 'Proposal changed' using errcode='40001';end if;
 update public.investigation_proposals set status=case when approve_input then 'APPROVED' else 'REJECTED' end,revision=revision+1,approved_by=case when approve_input then auth.uid() end,approved_fingerprint=case when approve_input then fingerprint end where id=p.id;
 update public.investigations set status=case when exists(select 1 from public.investigation_proposals where investigation_id=i.id and status='PROPOSED') then 'WAITING_FOR_APPROVAL' when exists(select 1 from public.investigation_proposals where investigation_id=i.id and status='MATERIALIZED') then 'RUNNING' else 'OPEN' end,revision=revision+1 where id=i.id;
 perform public.curiosity_audit(i,p.id,case when approve_input then 'PROPOSAL_APPROVED' else 'PROPOSAL_REJECTED' end);return p.id;
end;$$;
-- Preserve the original M1.7 implementation and ACLs behind a private entry point.
-- Only the ordinary wrapper or the provenance gate can invoke it.
alter function public.request_test_execution(uuid,uuid) rename to execution_request_base;
revoke all on function public.execution_request_base(uuid,uuid) from public,anon,authenticated,service_role,testpilot_runner;
create function public.request_test_execution(case_input uuid,environment_input uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare workspace uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select plan.workspace_id into workspace from public.test_items c join public.test_plans plan on plan.id=c.plan_id where c.id=case_input for share of c;
 perform 1 from public.workspace_members where workspace_id=workspace and user_id=auth.uid() for share;
 if not found then raise exception 'Unavailable' using errcode='42501';end if;
 -- A distinct materialized snapshot has exactly one proposal/run authorization.
 -- Shared ordinary source cases retain their original execution behavior.
 if exists(select 1 from public.investigation_proposals p where p.execution_case_id=case_input and p.execution_case_id<>p.case_id) then
 raise exception 'Curiosity materialization required' using errcode='23514';end if;
 return public.execution_request_base(case_input,environment_input);
end;$$;
create function public.curiosity_request_execution(proposal_input uuid,fingerprint_input text,case_input uuid,environment_input uuid) returns uuid language plpgsql set search_path='' as $$
declare i public.investigations%rowtype;p public.investigation_proposals%rowtype;c public.test_items%rowtype;plan public.test_plans%rowtype;case_review uuid;scenario_review uuid;run uuid;expected_definition jsonb;
begin
 i:=public.curiosity_lock((select investigation_id from public.investigation_proposals where id=proposal_input));
 select * into p from public.investigation_proposals where id=proposal_input for update;
 if environment_input is distinct from i.environment_id or p.environment_id is distinct from i.environment_id then raise exception 'Curiosity environment mismatch' using errcode='23514';end if;
 if fingerprint_input is distinct from p.fingerprint or p.approved_fingerprint is distinct from p.fingerprint then raise exception 'Exact approval required' using errcode='23514';end if;
 if p.run_id is not null then
 if case_input is distinct from p.execution_case_id then raise exception 'Curiosity case mismatch' using errcode='23514';end if;
 return p.run_id;end if;
 perform public.curiosity_open(i);
 if p.status<>'APPROVED' or p.revision<>1 or (select count(*) from public.investigation_proposals where investigation_id=i.id and run_id is not null)>=3
 or (select count(*) from public.investigation_proposals where investigation_id=i.id and operation_id=p.operation_id and run_id is not null)>=2 then raise exception 'Curiosity approval or execution budget unavailable' using errcode='23514';end if;
 perform 1 from public.workspace_members where workspace_id=i.workspace_id and user_id=p.approved_by and role in ('OWNER','ADMIN') for share;
 if not found then raise exception 'Approver membership changed' using errcode='42501';end if;
 select * into c from public.test_items where id=p.case_id for share;
 perform 1 from public.test_items where id=c.scenario_id for share;
 select * into plan from public.test_plans where id=c.plan_id;
 select id into case_review from public.test_reviews where item_id=c.id order by revision desc limit 1;
 select id into scenario_review from public.test_reviews where item_id=c.scenario_id order by revision desc limit 1;
 if case_review is distinct from p.case_review_id or scenario_review is distinct from p.scenario_review_id
 or not public.curiosity_case_in_scope(i,c.id) or not public.execution_planning_ready(c.id)
 or p.operation_id is distinct from public.curiosity_operation(c.id)
 or public.curiosity_fingerprint(i,c,plan,case_review,scenario_review,p.payload,p.observed_status) is distinct from p.fingerprint then raise exception 'Approved planning changed' using errcode='40001';end if;
 if p.observed_status is null then
 if case_input is distinct from c.id then raise exception 'Curiosity case mismatch' using errcode='23514';end if;
 else
 expected_definition:=jsonb_set(jsonb_set(jsonb_set(c.definition,'{logicalKey}',to_jsonb('CURIOSITY_'||p.id::text)),'{input}',jsonb_build_object('strategy','OBSERVED_STATUS','pointer',p.payload->'bindings'->0->>'parameterPointer','value',p.observed_status)),'{sourcePointers}',jsonb_build_array(p.payload->'bindings'->0->>'parameterPointer'));
 perform 1 from public.test_items snapshot where snapshot.id=case_input and snapshot.id<>c.id and snapshot.plan_id=p.plan_id and snapshot.workspace_id=i.workspace_id and snapshot.qa_analysis_id=p.qa_analysis_id and snapshot.scenario_id=c.scenario_id and snapshot.definition=expected_definition and snapshot.logical_key='CURIOSITY_'||p.id::text for share;
 if not found then raise exception 'Curiosity snapshot mismatch' using errcode='23514';end if;
 end if;
 -- The root lock covers validation, M1.7 insertion and accounting in one transaction.
 run:=public.execution_request_base(case_input,environment_input);
 update public.investigation_proposals set status='MATERIALIZED',run_id=run,execution_case_id=case_input,revision=revision+1 where id=p.id;
 update public.investigations set status='RUNNING',revision=revision+1 where id=i.id;
 perform public.curiosity_audit(i,p.id,'PROPOSAL_MATERIALIZED');return run;
end;$$;
create function public.materialize_investigation_proposal(proposal_input uuid,fingerprint_input text) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.investigations%rowtype;p public.investigation_proposals%rowtype;c public.test_items%rowtype;run uuid;execution_case uuid;definition jsonb;
begin
 i:=public.curiosity_lock((select investigation_id from public.investigation_proposals where id=proposal_input));
 select * into p from public.investigation_proposals where id=proposal_input for update;
 if fingerprint_input is distinct from p.fingerprint or p.approved_fingerprint is distinct from p.fingerprint then raise exception 'Exact approval required' using errcode='23514';end if;
 if p.run_id is not null then return p.run_id;end if;
 perform public.curiosity_open(i);
 if p.status<>'APPROVED' or (select count(*) from public.investigation_proposals where investigation_id=i.id and run_id is not null)>=3 then raise exception 'Not approved or execution budget exhausted' using errcode='23514';end if;
 perform 1 from public.workspace_members where workspace_id=i.workspace_id and user_id=p.approved_by and role in ('OWNER','ADMIN') for share;if not found then raise exception 'Approver membership changed' using errcode='42501';end if;
 select * into c from public.test_items where id=p.case_id for share;
 -- Match and lock every review identity; M1.7 independently pins/rechecks it again.
 perform 1 from public.test_items where id=c.scenario_id for share;
 if not public.curiosity_case_in_scope(i,c.id) or not public.execution_planning_ready(c.id)
 or p.case_review_id is distinct from (select id from public.test_reviews where item_id=c.id order by revision desc limit 1)
 or p.scenario_review_id is distinct from (select id from public.test_reviews where item_id=c.scenario_id order by revision desc limit 1) then raise exception 'Approved planning changed' using errcode='40001';end if;
 execution_case:=c.id;
 if p.observed_status is not null then
 -- Deterministic materialization copies trusted planning/graph/requirements; only a
 -- provenance-checked safe observed status replaces one known numeric query input.
 definition:=jsonb_set(jsonb_set(jsonb_set(c.definition,'{logicalKey}',to_jsonb('CURIOSITY_'||p.id::text)),'{input}',jsonb_build_object('strategy','OBSERVED_STATUS','pointer',p.payload->'bindings'->0->>'parameterPointer','value',p.observed_status)),'{sourcePointers}',jsonb_build_array(p.payload->'bindings'->0->>'parameterPointer'));
 insert into public.test_items(plan_id,qa_analysis_id,workspace_id,kind,logical_key,scenario_id,definition,origin,created_by) values(c.plan_id,c.qa_analysis_id,c.workspace_id,'CASE',definition->>'logicalKey',c.scenario_id,definition,c.origin,auth.uid()) returning id into execution_case;
 insert into public.test_item_qa_links select execution_case,plan_id,qa_analysis_id,workspace_id,qa_item_id,qa_kind from public.test_item_qa_links where item_id=c.id;
 insert into public.test_item_nodes select execution_case,plan_id,qa_analysis_id,workspace_id,behaviour_graph_id,api_import_id,project_id,node_id from public.test_item_nodes where item_id=c.id;
 insert into public.test_item_edges select execution_case,plan_id,qa_analysis_id,workspace_id,behaviour_graph_id,api_import_id,project_id,edge_id from public.test_item_edges where item_id=c.id;
 insert into public.test_reviews(item_id,plan_id,qa_analysis_id,workspace_id,revision,actor_id,decision,rationale) values(execution_case,c.plan_id,c.qa_analysis_id,c.workspace_id,1,p.approved_by,'APPROVE','Exact fingerprint-bound curiosity proposal approved.');
 insert into public.test_audit_events(plan_id,qa_analysis_id,workspace_id,item_id,actor_id,event) values(c.plan_id,c.qa_analysis_id,c.workspace_id,execution_case,p.approved_by,'CASE_APPROVE');
 end if;
 run:=public.curiosity_request_execution(p.id,fingerprint_input,execution_case,i.environment_id);return run;
end;$$;
create function public.refresh_investigation(investigation_input uuid,conclude_input boolean default false,stop_input boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.investigations%rowtype;p public.investigation_proposals%rowtype;package uuid;outcomes text[];conclusion_value text;
begin
 i:=public.curiosity_lock(investigation_input);
 if conclude_input is null or stop_input is null or (conclude_input and stop_input) then raise exception 'Invalid action' using errcode='23514';end if;
 if i.status='CONCLUDED' then return i.id;end if;
 for p in select * from public.investigation_proposals where investigation_id=i.id and (status='MATERIALIZED' or (status='BLOCKED' and result_package_id is null)) order by id for update loop
 if stop_input then perform public.cancel_test_execution(p.run_id);end if;
 if exists(select 1 from public.execution_results where run_id=p.run_id) then
 package:=public.derive_execution_evidence(p.run_id);
 update public.investigation_proposals set status='EXECUTED',result_package_id=package,revision=revision+1 where id=p.id;
 perform public.curiosity_audit(i,p.id,'STEP_EXECUTED');
 elsif p.status='MATERIALIZED' and exists(select 1 from public.execution_runs where id=p.run_id and status in ('BLOCKED','CANCELLED')) then
 update public.investigation_proposals set status='BLOCKED',revision=revision+1 where id=p.id;
 perform public.curiosity_audit(i,p.id,'PROPOSAL_BLOCKED');end if;
 end loop;
 -- Reconcile late results without reopening or changing the terminal stop decision.
 if i.status='STOPPED' then return i.id;end if;
 if stop_input then
 update public.investigations set status='STOPPED',conclusion='STOPPED_BY_POLICY',revision=revision+1 where id=i.id;
 perform public.curiosity_audit(i,null,'INVESTIGATION_STOPPED');return i.id;end if;
 if conclude_input then
 if exists(select 1 from public.investigation_proposals where investigation_id=i.id and status in ('PROPOSED','APPROVED','MATERIALIZED')) then raise exception 'Investigation still has pending steps' using errcode='23514';end if;
 -- Include policy/cancellation states even when they have no result package.
 select array_agg(coalesce(r.result->>'outcome',run.status)) into outcomes
 from public.investigation_proposals step join public.execution_runs run on run.id=step.run_id
 left join public.execution_results r on r.run_id=run.id where step.investigation_id=i.id;
 if outcomes is null then raise exception 'Resulting evidence required' using errcode='23514';end if;
 -- Actual failure outranks incomplete work; mixed success/policy is inconclusive.
 conclusion_value:=case when 'FAILED'=any(outcomes) then 'HYPOTHESIS_NOT_SUPPORTED'
 when outcomes<@array['PASSED'] then 'HYPOTHESIS_SUPPORTED'
 when outcomes<@array['BLOCKED','CANCELLED'] then 'STOPPED_BY_POLICY'
 when not(outcomes<@array['PASSED','BLOCKED','CANCELLED']) then 'INCONCLUSIVE'
 when (select count(*) from public.investigation_proposals where investigation_id=i.id and run_id is not null)>=3 then 'BUDGET_EXHAUSTED'
 else 'INCONCLUSIVE' end;
 -- Select an outcome supporting this decision; all other evidence remains on steps.
 select step.result_package_id into package from public.investigation_proposals step
 join public.execution_results r on r.run_id=step.run_id where step.investigation_id=i.id and step.result_package_id is not null
 and case conclusion_value when 'HYPOTHESIS_NOT_SUPPORTED' then r.result->>'outcome'='FAILED'
 when 'HYPOTHESIS_SUPPORTED' then r.result->>'outcome'='PASSED'
 when 'STOPPED_BY_POLICY' then r.result->>'outcome' in ('BLOCKED','CANCELLED')
 else r.result->>'outcome' not in ('PASSED','FAILED') end
 order by step.created_at,step.id limit 1;
 update public.investigations set status='CONCLUDED',conclusion=conclusion_value,conclusion_package_id=package,revision=revision+1 where id=i.id;
 perform public.curiosity_audit(i,null,'INVESTIGATION_CONCLUDED');
 else update public.investigations set status=case when exists(select 1 from public.investigation_proposals where investigation_id=i.id and status='PROPOSED') then 'WAITING_FOR_APPROVAL' when exists(select 1 from public.investigation_proposals where investigation_id=i.id and status='MATERIALIZED') then 'RUNNING' else 'OPEN' end where id=i.id;
 end if;return i.id;
end;$$;
revoke all on function public.curiosity_fingerprint(public.investigations,public.test_items,public.test_plans,uuid,uuid,jsonb,integer) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.curiosity_request_execution(uuid,text,uuid,uuid) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.request_test_execution(uuid,uuid) from public,anon,authenticated,service_role,testpilot_runner;
grant execute on function public.request_test_execution(uuid,uuid) to authenticated;
revoke all on function public.curiosity_lock(uuid) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.curiosity_open(public.investigations) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.curiosity_operation(uuid) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.curiosity_case_in_scope(public.investigations,uuid) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.curiosity_audit(public.investigations,uuid,text) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.derive_investigation(uuid,uuid) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.investigation_context(uuid) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.persist_investigation_proposal(uuid,jsonb) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.decide_investigation_proposal(uuid,integer,text,boolean) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.materialize_investigation_proposal(uuid,text) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.refresh_investigation(uuid,boolean,boolean) from public,anon,authenticated,service_role,testpilot_runner;
grant execute on function public.derive_investigation(uuid,uuid) to authenticated;
grant execute on function public.investigation_context(uuid) to authenticated;
grant execute on function public.persist_investigation_proposal(uuid,jsonb) to authenticated;
grant execute on function public.decide_investigation_proposal(uuid,integer,text,boolean) to authenticated;
grant execute on function public.materialize_investigation_proposal(uuid,text) to authenticated;
grant execute on function public.refresh_investigation(uuid,boolean,boolean) to authenticated;
select public.validate_execution_runner_role();
commit;
