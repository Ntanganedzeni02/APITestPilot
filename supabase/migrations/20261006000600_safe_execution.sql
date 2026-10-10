begin;
-- Dedicated non-login runner role: only narrow execution RPCs, no table access.
do $$ begin if not exists(select 1 from pg_roles where rolname='testpilot_runner') then create role testpilot_runner nologin noinherit;end if;if exists(select 1 from pg_catalog.pg_roles where rolname='authenticator') then
 if current_setting('server_version_num')::integer>=160000 then
  execute 'grant testpilot_runner to authenticator with admin false, inherit false, set true';
 else
  -- PG15 has role-level inheritance and implicit SET authority.
  grant testpilot_runner to authenticator;
 end if;
end if;end;$$;

-- PG17 implicit creator administration is granted by bootstrap superuser OID 10.
-- This private predicate also accepts PG15 catalog rows for local regression only.
create function public.execution_runner_membership_safe(m jsonb,runner oid) returns boolean language sql stable set search_path='' as $$
 select coalesce((m->>'roleid')::oid=runner and exists(
  select 1 from pg_catalog.pg_roles member_role where member_role.oid=(m->>'member')::oid and (
   (member_role.rolname='postgres' and member_role.rolcreaterole
    and (m->>'grantor')::oid=10 and exists(select 1 from pg_catalog.pg_roles where oid=10 and rolsuper)
    and m->'admin_option'='true'::jsonb and m->'inherit_option'='false'::jsonb and m->'set_option'='false'::jsonb)
   or (member_role.rolname='authenticator' and m->'admin_option'='false'::jsonb
    and coalesce((m->>'inherit_option')::boolean,member_role.rolinherit)=false
    and coalesce((m->>'set_option')::boolean,true)=true
    and exists(select 1 from pg_catalog.pg_roles grantor_role where grantor_role.oid=(m->>'grantor')::oid
     and (grantor_role.oid=10 and grantor_role.rolsuper or grantor_role.rolname='postgres' and grantor_role.rolcreaterole)))
  )),false);
$$;
revoke all on function public.execution_runner_membership_safe(jsonb,oid) from public,anon,authenticated,service_role,testpilot_runner;

-- Only the observed pg_stat_statements PUBLIC SELECT baseline is tolerated.
-- Exact extension dependency prevents a similarly named ordinary view qualifying.
create function public.execution_runner_platform_view_safe(relation_input oid,runner oid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where c.oid=relation_input and n.nspname='extensions' and c.relname in ('pg_stat_statements','pg_stat_statements_info') and c.relkind='v' and c.relowner<>runner
  and exists(select 1 from pg_catalog.pg_depend d join pg_catalog.pg_extension e on e.oid=d.refobjid where d.classid='pg_catalog.pg_class'::regclass and d.objid=c.oid and d.refclassid='pg_catalog.pg_extension'::regclass and d.deptype='e' and e.extname='pg_stat_statements')
  and exists(select 1 from pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a where a.grantee=0 and a.privilege_type='SELECT')
  and not exists(select 1 from pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a where a.grantee=runner or a.grantee=0 and a.privilege_type<>'SELECT')
  and not exists(select 1 from pg_catalog.pg_attribute col cross join lateral pg_catalog.aclexplode(col.attacl) a where col.attrelid=c.oid and a.grantee in (0,runner)));
$$;
revoke all on function public.execution_runner_platform_view_safe(oid,oid) from public,anon,authenticated,service_role,testpilot_runner;

create function public.validate_execution_runner_role() returns void language plpgsql set search_path='' as $$
declare runner oid;
begin
 select oid into runner from pg_catalog.pg_roles where rolname='testpilot_runner' and not(rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls or rolcanlogin or rolinherit);
 if runner is null then raise exception 'Unsafe runner role attributes' using errcode='42501';end if;
 if exists(select 1 from pg_catalog.pg_auth_members where member=runner) or exists(select 1 from pg_catalog.pg_auth_members m where m.roleid=runner and not public.execution_runner_membership_safe(to_jsonb(m),runner)) then raise exception 'Unsafe runner membership' using errcode='42501';end if;
 if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema' and c.relkind in ('r','p','v','m','f') and (c.relowner=runner or pg_catalog.has_table_privilege(runner,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not public.execution_runner_platform_view_safe(c.oid,runner))) then raise exception 'Unexpected runner relation access' using errcode='42501';end if;
 -- Standard system visibility is not a license for explicit runner grants.
 if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_(temp|toast_temp)_' and (c.relowner=runner or exists(select 1 from pg_catalog.aclexplode(c.relacl) a where a.grantee=runner))) then raise exception 'Unexpected explicit runner relation authority' using errcode='42501';end if;
 if current_setting('server_version_num')::integer>=170000 then
  if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema' and c.relkind in ('r','p','v','m','f') and pg_catalog.has_table_privilege(runner,c.oid,'MAINTAIN')) then raise exception 'Unexpected runner maintenance authority' using errcode='42501';end if;
 end if;
 if exists(select 1 from pg_catalog.pg_attribute col join pg_catalog.pg_class c on c.oid=col.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace cross join lateral pg_catalog.aclexplode(col.attacl) a where a.grantee=runner or a.grantee=0 and n.nspname not like 'pg_%' and n.nspname<>'information_schema') then raise exception 'Unexpected runner column authority' using errcode='42501';end if;
 if exists(select 1 from pg_catalog.pg_class c where c.relkind='S' and (c.relowner=runner or pg_catalog.has_sequence_privilege(runner,c.oid,'USAGE,SELECT,UPDATE'))) then raise exception 'Unexpected runner sequence authority' using errcode='42501';end if;
 -- USAGE is required only on public; pg_catalog/information_schema are platform visibility.
 -- Session temporary schemas follow the explicitly accepted database TEMPORARY baseline.
 if exists(select 1 from pg_catalog.pg_namespace n where n.nspname !~ '^pg_(temp|toast_temp)_' and (n.nspowner=runner or pg_catalog.has_schema_privilege(runner,n.oid,'CREATE') or pg_catalog.has_schema_privilege(runner,n.oid,'USAGE') and n.nspname not in ('public','pg_catalog','information_schema'))) then raise exception 'Unexpected runner schema authority' using errcode='42501';end if;
 -- PUBLIC CONNECT/TEMPORARY are accepted; CREATE and database ownership are not.
 if exists(select 1 from pg_catalog.pg_database d where d.datdba=runner or pg_catalog.has_database_privilege(runner,d.oid,'CREATE')) then raise exception 'Unexpected runner database authority' using errcode='42501';end if;
 if exists(select 1 from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid=f.pronamespace where (f.proowner=runner or exists(select 1 from pg_catalog.aclexplode(coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) a where (a.grantee=runner or a.grantee=0 and f.proname in ('claim_test_execution','record_execution_safety','finish_test_execution','execution_cancel_requested','authorize_execution_send')) and not exists(select 1 from (values (pg_catalog.to_regprocedure('public.claim_test_execution()')),(pg_catalog.to_regprocedure('public.record_execution_safety(uuid,uuid,text,jsonb,jsonb,jsonb,text)')),(pg_catalog.to_regprocedure('public.finish_test_execution(uuid,uuid,jsonb)')),(pg_catalog.to_regprocedure('public.execution_cancel_requested(uuid,uuid)')),(pg_catalog.to_regprocedure('public.authorize_execution_send(uuid,uuid,text,uuid,text)'))) approved(identity) where approved.identity::oid=f.oid)))) then raise exception 'Unexpected runner routine authority' using errcode='42501';end if;
end;$$;
revoke all on function public.validate_execution_runner_role() from public,anon,authenticated,service_role,testpilot_runner;
select public.validate_execution_runner_role();

grant usage on schema public to testpilot_runner;
alter table public.environments add constraint environment_execution_scope unique(id,project_id);
alter table public.test_items add constraint execution_case_parent_scope unique(id,scenario_id,plan_id);
alter table public.test_reviews add constraint execution_review_item_scope unique(id,item_id,plan_id);
create table public.environment_execution_configs (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,project_id uuid not null,environment_id uuid not null,base_url text not null check(length(base_url) between 1 and 2048 and base_url !~ '[[:space:]]' and base_url !~ '[\\?#@]' and base_url ~ '^https?://'),port integer not null check(port between 1 and 65535),enabled boolean not null,timeout_ms integer not null check(timeout_ms between 100 and 10000),response_limit integer not null check(response_limit between 1024 and 1048576),created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 unique(id,workspace_id),unique(id,environment_id,project_id,workspace_id),foreign key(project_id,workspace_id) references public.projects(id,workspace_id),foreign key(environment_id,project_id) references public.environments(id,project_id)
);
create index execution_config_history on public.environment_execution_configs(environment_id,created_at desc,id desc);
create table public.execution_runs (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,project_id uuid not null,environment_id uuid not null,config_id uuid not null,plan_id uuid not null,case_id uuid not null,case_kind text not null default 'CASE' check(case_kind='CASE'),api_import_id uuid not null,behaviour_graph_id uuid not null,qa_analysis_id uuid not null,case_review_id uuid not null,scenario_review_id uuid not null,scenario_id uuid not null,scenario_kind text not null default 'SCENARIO' check(scenario_kind='SCENARIO'),
 requested_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),started_at timestamptz,completed_at timestamptz,send_authorized_at timestamptz,status text not null default 'REQUESTED' check(status in ('REQUESTED','SAFETY_REVIEW','PENDING_APPROVAL','AUTHORIZED','RUNNING','COMPLETED','ERROR','BLOCKED','CANCELLED')),decision text check(decision in ('ALLOW','REQUIRES_APPROVAL','BLOCK')),policy_version text check(policy_version='1.0.0'),reason_codes jsonb not null default '[]' check(jsonb_typeof(reason_codes)='array' and jsonb_array_length(reason_codes)<=30),facts jsonb,request jsonb,fingerprint text check(fingerprint ~ '^[a-f0-9]{64}$'),approved_by uuid references auth.users(id),approved_fingerprint text,claim_token uuid,cancel_requested boolean not null default false,
 foreign key(config_id,environment_id,project_id,workspace_id) references public.environment_execution_configs(id,environment_id,project_id,workspace_id),foreign key(plan_id,behaviour_graph_id,api_import_id,project_id,workspace_id) references public.test_plans(id,behaviour_graph_id,api_import_id,project_id,workspace_id),foreign key(plan_id,qa_analysis_id,workspace_id) references public.test_plans(id,qa_analysis_id,workspace_id),foreign key(case_id,plan_id,case_kind) references public.test_items(id,plan_id,kind),foreign key(case_id,scenario_id,plan_id) references public.test_items(id,scenario_id,plan_id),foreign key(scenario_id,plan_id,scenario_kind) references public.test_items(id,plan_id,kind),foreign key(case_review_id,case_id,plan_id) references public.test_reviews(id,item_id,plan_id),foreign key(scenario_review_id,scenario_id,plan_id) references public.test_reviews(id,item_id,plan_id),
 check(request is null or jsonb_typeof(request)='object' and octet_length(request::text)<=131072),check(facts is null or jsonb_typeof(facts)='object' and octet_length(facts::text)<=16384),check(approved_by is null or decision='REQUIRES_APPROVAL' and approved_fingerprint=fingerprint),check(status not in ('AUTHORIZED','RUNNING','COMPLETED') or decision in ('ALLOW','REQUIRES_APPROVAL') and fingerprint is not null),unique(id,workspace_id)
);
create index execution_pending on public.execution_runs(status,created_at,id);
create table public.execution_results (
 run_id uuid primary key,workspace_id uuid not null,result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=1200000),created_at timestamptz not null default clock_timestamp(),foreign key(run_id,workspace_id) references public.execution_runs(id,workspace_id)
);
create table public.execution_audit_events (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,run_id uuid,config_id uuid,actor_id uuid references auth.users(id),system_actor boolean not null default false,event text not null check(event in ('ENVIRONMENT_EXECUTION_CONFIGURED','EXECUTION_REQUESTED','SAFETY_EVALUATED','EXECUTION_APPROVAL_REQUESTED','EXECUTION_APPROVED','EXECUTION_REJECTED','EXECUTION_STARTED','EXECUTION_SEND_AUTHORIZED','EXECUTION_COMPLETED','EXECUTION_FAILED','EXECUTION_BLOCKED','EXECUTION_CANCELLED','CANCELLATION_REQUESTED')),created_at timestamptz not null default clock_timestamp(),foreign key(run_id,workspace_id) references public.execution_runs(id,workspace_id),foreign key(config_id,workspace_id) references public.environment_execution_configs(id,workspace_id),check((system_actor and actor_id is null) or (not system_actor and actor_id is not null))
);
create index execution_audit_history on public.execution_audit_events(workspace_id,created_at,id);
alter table public.environment_execution_configs enable row level security;
create policy execution_config_read on public.environment_execution_configs for select to authenticated using(public.is_workspace_member(workspace_id));
alter table public.execution_runs enable row level security;
create policy execution_run_read on public.execution_runs for select to authenticated using(public.is_workspace_member(workspace_id));
alter table public.execution_results enable row level security;
create policy execution_result_read on public.execution_results for select to authenticated using(public.is_workspace_member(workspace_id));
alter table public.execution_audit_events enable row level security;
create policy execution_audit_read on public.execution_audit_events for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.environment_execution_configs,public.execution_runs,public.execution_results,public.execution_audit_events from public,anon,authenticated,service_role,testpilot_runner;
grant select on public.environment_execution_configs,public.execution_runs,public.execution_results,public.execution_audit_events to authenticated;

create function public.execution_literal_safe(v text) returns boolean language plpgsql immutable set search_path='' as $$
declare text_input text:=replace(v,'~1','/');m text[];segment text;parts text[];i integer;
begin
 if v is null or length(v)>2048 then return false;end if;
 loop m:=regexp_match(text_input,'%([0-9a-fA-F]{2})');exit when m is null;text_input:=replace(text_input,'%'||m[1],chr(get_byte(decode(m[1],'hex'),0)));end loop;
 parts:=string_to_array(lower(text_input),'/');
 for i in 1..coalesce(array_length(parts,1),0) loop
 segment:=parts[i];
 if segment ~ '(token|access_token|api_key|apikey|secret|password|passwd|authorization|bearer|session|cookie|credential|client_secret)[=:\s]' or segment ~ '^eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+$' or segment ~ '^[a-f0-9]{32,}$' or (segment ~ '^[a-z0-9_-]{24,}$' and segment ~ '[a-z]' and segment ~ '[0-9]') then return false;end if;
 if segment ~ '^(token|access_token|api_key|apikey|secret|password|passwd|authorization|bearer|session|cookie|credential|client_secret)$' and i<array_length(parts,1) and parts[i+1] not in ('','refresh','revoke','verify','validate','status','reset') then return false;end if;
 end loop;return true;
 exception when others then return false;
end;$$;
revoke all on function public.execution_literal_safe(text) from public,anon,authenticated,service_role,testpilot_runner;

create function public.configure_execution_environment(environment_input uuid,base_input text,port_input integer,enabled_input boolean,timeout_input integer default 10000,response_input integer default 1048576) returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();e public.environments%rowtype;w uuid;result uuid;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into e from public.environments where id=environment_input for update;if not found then raise exception 'Unavailable' using errcode='42501';end if;
 select workspace_id into w from public.projects where id=e.project_id;
 perform 1 from public.workspace_members where workspace_id=w and user_id=caller and role in ('OWNER','ADMIN') for share;if not found then raise exception 'Target configuration permission required' using errcode='42501';end if;
 if not public.execution_literal_safe(base_input) or base_input is null or length(base_input)>2048 or base_input !~ '^https?://[^/@?#[:space:]]+(/[^?#[:space:]]*)?$' or base_input ~ '[\\@]' then raise exception 'Unsafe target configuration' using errcode='23514';end if;
 insert into public.environment_execution_configs(workspace_id,project_id,environment_id,base_url,port,enabled,timeout_ms,response_limit,created_by) values(w,e.project_id,e.id,base_input,port_input,enabled_input,timeout_input,response_input,caller) returning id into result;
 insert into public.execution_audit_events(workspace_id,config_id,actor_id,event) values(w,result,caller,'ENVIRONMENT_EXECUTION_CONFIGURED');return result;
end;$$;
create function public.execution_planning_ready(item_input uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.test_items i join public.test_items parent on parent.id=i.scenario_id where i.id=item_input and i.kind='CASE' and i.origin='DETERMINISTIC' and i.definition->'executable'='true'::jsonb
 and (select decision from public.test_reviews where item_id=i.id order by revision desc limit 1)='APPROVE'
 and (select decision from public.test_reviews where item_id=parent.id order by revision desc limit 1)='APPROVE'
 and exists(select 1 from public.test_item_qa_links where item_id=i.id and qa_kind='REQUIREMENT')
 and not exists(select 1 from public.test_item_qa_links l join public.test_requirement_versions v on v.plan_id=i.plan_id and v.requirement_id=l.qa_item_id where l.item_id=i.id and l.qa_kind='REQUIREMENT' and (v.status<>'APPROVED' or v.has_edits or v.source_kind not in ('SPEC_EXPLICIT','GRAPH_DERIVED'))));
$$;
create function public.request_test_execution(case_input uuid,environment_input uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();i public.test_items%rowtype;p public.test_plans%rowtype;c public.environment_execution_configs%rowtype;result uuid;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into i from public.test_items where id=case_input for share;select * into p from public.test_plans where id=i.plan_id;
 perform 1 from public.workspace_members where workspace_id=p.workspace_id and user_id=caller for share;if not found then raise exception 'Unavailable' using errcode='42501';end if;
 perform 1 from public.environments where id=environment_input and project_id=p.project_id for share;if not found then raise exception 'Environment unavailable' using errcode='23514';end if;
 if not public.execution_planning_ready(i.id) then raise exception 'Planning not ready' using errcode='23514';end if;
 select * into c from public.environment_execution_configs where environment_id=environment_input order by created_at desc,id desc limit 1;if not found or not c.enabled then raise exception 'Configure an enabled target first' using errcode='23514';end if;
 insert into public.execution_runs(workspace_id,project_id,environment_id,config_id,plan_id,case_id,api_import_id,behaviour_graph_id,qa_analysis_id,requested_by,case_review_id,scenario_review_id,scenario_id) values(p.workspace_id,p.project_id,environment_input,c.id,p.id,i.id,p.api_import_id,p.behaviour_graph_id,p.qa_analysis_id,caller,(select id from public.test_reviews where item_id=i.id order by revision desc limit 1),(select id from public.test_reviews where item_id=i.scenario_id order by revision desc limit 1),i.scenario_id) returning id into result;
 insert into public.execution_audit_events(workspace_id,run_id,actor_id,event) values(p.workspace_id,result,caller,'EXECUTION_REQUESTED');return result;
end;$$;
create function public.execution_binding_current(r public.execution_runs) returns boolean language sql stable set search_path='' as $$
 select public.execution_planning_ready(r.case_id) and r.config_id=(select id from public.environment_execution_configs where environment_id=r.environment_id order by created_at desc,id desc limit 1)
 and r.case_review_id=(select id from public.test_reviews where item_id=r.case_id order by revision desc limit 1)
 and r.scenario_review_id=(select v.id from public.test_reviews v join public.test_items i on i.scenario_id=v.item_id where i.id=r.case_id order by v.revision desc limit 1)
 and exists(select 1 from public.workspace_members where workspace_id=r.workspace_id and user_id=r.requested_by) and (r.approved_by is null or exists(select 1 from public.workspace_members where workspace_id=r.workspace_id and user_id=r.approved_by and role in ('OWNER','ADMIN')));
$$;
create function public.decide_execution_approval(run_input uuid,fingerprint_input text,approve_input boolean) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();r public.execution_runs%rowtype;
begin
 select * into r from public.execution_runs where id=run_input for update;
 if caller is null or r.id is null then raise exception 'Unavailable' using errcode='42501';end if;
 perform 1 from public.workspace_members where workspace_id=r.workspace_id and user_id=caller and role in ('OWNER','ADMIN') for share;if not found then raise exception 'Approval permission required' using errcode='42501';end if;
 if r.status<>'PENDING_APPROVAL' or r.decision<>'REQUIRES_APPROVAL' or fingerprint_input is distinct from r.fingerprint or not public.execution_binding_current(r) then raise exception 'Approval binding changed or blocked' using errcode='23514';end if;
 update public.execution_runs set status=case when approve_input then 'AUTHORIZED' else 'CANCELLED' end,approved_by=case when approve_input then caller end,approved_fingerprint=case when approve_input then r.fingerprint end where id=r.id;
 insert into public.execution_audit_events(workspace_id,run_id,actor_id,event) values(r.workspace_id,r.id,caller,case when approve_input then 'EXECUTION_APPROVED' else 'EXECUTION_REJECTED' end);
end;$$;
create function public.cancel_test_execution(run_input uuid) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();r public.execution_runs%rowtype;
begin
 select * into r from public.execution_runs where id=run_input for update;if caller is null or r.id is null or not public.is_workspace_member(r.workspace_id) then raise exception 'Unavailable' using errcode='42501';end if;
 if r.status in ('COMPLETED','ERROR','BLOCKED','CANCELLED') then return;end if;
 update public.execution_runs set cancel_requested=true,status=case when r.status='RUNNING' then 'RUNNING' else 'CANCELLED' end where id=r.id;
 insert into public.execution_audit_events(workspace_id,run_id,actor_id,event) values(r.workspace_id,r.id,caller,case when r.status='RUNNING' then 'CANCELLATION_REQUESTED' else 'EXECUTION_CANCELLED' end);
end;$$;
-- Private context assembly; no caller-controlled ownership or executable prose.
create function public.execution_worker_context(r public.execution_runs) returns jsonb language sql set search_path='' as $$
 select jsonb_build_object('run',to_jsonb(r),'target',jsonb_build_object('id',c.id,'environmentId',c.environment_id,'type',e.type,'baseUrl',c.base_url,'enabled',c.enabled,'port',c.port,'timeoutMs',c.timeout_ms,'responseLimit',c.response_limit),
 'source',jsonb_build_object('id',s.id,'workspaceId',s.workspace_id,'projectId',s.project_id,'createdAt',s.created_at,'createdBy',s.created_by,'knowledge',s.knowledge),
 'plan',jsonb_build_object('id',p.id,'workspaceId',p.workspace_id,'projectId',p.project_id,'importId',p.api_import_id,'graphId',p.behaviour_graph_id,'analysisId',p.qa_analysis_id,'requirements',(select jsonb_agg(jsonb_build_object('id',v.requirement_id,'reviewId',v.review_id,'status',v.status,'title',v.title,'statement',v.statement)) from public.test_requirement_versions v where v.plan_id=p.id and exists(select 1 from public.test_item_qa_links l where l.item_id=r.case_id and l.qa_item_id=v.requirement_id and l.qa_kind='REQUIREMENT')),'records',(select jsonb_agg(i.definition||jsonb_build_object('id',i.id,'planId',i.plan_id,'createdAt',i.created_at,'createdBy',i.created_by,'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'decision',v.decision,'title',v.title,'objective',v.objective,'expectedBehavior',v.expected_behavior,'revision',v.revision) order by v.revision) from public.test_reviews v where v.item_id=i.id),'[]'::jsonb))) from public.test_items i where i.plan_id=p.id and (i.id=r.case_id or i.id=(select scenario_id from public.test_items where id=r.case_id)))))
 from public.environment_execution_configs c join public.environments e on e.id=c.environment_id join public.test_plans p on p.id=r.plan_id join public.api_imports s on s.id=r.api_import_id where c.id=r.config_id;
$$;
create function public.claim_test_execution() returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.execution_runs%rowtype;token uuid:=gen_random_uuid();
begin
 select * into r from public.execution_runs where status in ('REQUESTED','AUTHORIZED') order by created_at,id for update skip locked limit 1;if not found then return null;end if;
 if not public.execution_binding_current(r) then update public.execution_runs set status='BLOCKED',decision='BLOCK',approved_by=null,approved_fingerprint=null,reason_codes='["EXECUTION_BINDING_CHANGED"]' where id=r.id;insert into public.execution_audit_events(workspace_id,run_id,system_actor,event) values(r.workspace_id,r.id,true,'EXECUTION_BLOCKED');return null;end if;
 if r.status='AUTHORIZED' and (r.decision='BLOCK' or r.decision='REQUIRES_APPROVAL' and (r.approved_by is null or r.approved_fingerprint is distinct from r.fingerprint)) then raise exception 'Execution not authorized' using errcode='23514';end if;
 update public.execution_runs set status=case when r.status='REQUESTED' then 'SAFETY_REVIEW' else 'RUNNING' end,claim_token=token,started_at=case when r.status='AUTHORIZED' then clock_timestamp() end where id=r.id returning * into r;
 if r.status='RUNNING' then insert into public.execution_audit_events(workspace_id,run_id,system_actor,event) values(r.workspace_id,r.id,true,'EXECUTION_STARTED');end if;
 return public.execution_worker_context(r);
end;$$;
create function public.execution_body_safe(value_input jsonb,depth_input integer default 0) returns boolean language plpgsql immutable set search_path='' as $$
declare entry record;
begin
 if depth_input>8 then return false;end if;
 case jsonb_typeof(value_input)
 when 'null','number','boolean' then return true;
 when 'string' then return value_input#>>'{}' ~ '^(testpilot-synthetic|synthetic-invalid|x{0,1000})$';
 when 'array' then if jsonb_array_length(value_input)>10 then return false;end if;for entry in select value from jsonb_array_elements(value_input) loop if not public.execution_body_safe(entry.value,depth_input+1) then return false;end if;end loop;return true;
 when 'object' then if (select count(*) from jsonb_object_keys(value_input))>10 then return false;end if;for entry in select key,value from jsonb_each(value_input) loop if entry.key !~ '^[a-zA-Z0-9_-]{1,80}$' or entry.key ~* '(authorization|cookie|api.?key|password|secret|token|credential|email|phone)' or not public.execution_body_safe(entry.value,depth_input+1) then return false;end if;end loop;return true;
 else return false;end case;
end;$$;
revoke all on function public.execution_body_safe(jsonb,integer) from public,anon,authenticated,service_role,testpilot_runner;

-- The compiler emits only justified declared-status assertions in M1.7.
create function public.execution_request_assertions_safe(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare a jsonb;
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>30 then return false;end if;
 for a in select value from jsonb_array_elements(v) loop
 if jsonb_typeof(a) is distinct from 'object' or not(a ?& array['kind','expected','pointer']) or a-array['kind','expected','pointer']<>'{}' or a->>'kind' is distinct from 'STATUS_IN_DECLARED_SET' or jsonb_typeof(a->'expected') is distinct from 'array' or jsonb_array_length(a->'expected') not between 1 and 100 or exists(select 1 from jsonb_array_elements(a->'expected') e where jsonb_typeof(e)<>'number' or e::text !~ '^[0-9]{3}$' or e::text::integer not between 100 and 599) or jsonb_typeof(a->'pointer') is distinct from 'string' or not public.execution_literal_safe(a->>'pointer') then return false;end if;
 end loop;return true;
 exception when others then return false;
end;$$;
revoke all on function public.execution_request_assertions_safe(jsonb) from public,anon,authenticated,service_role,testpilot_runner;

create function public.record_execution_safety(run_input uuid,token_input uuid,decision_input text,codes_input jsonb,facts_input jsonb,request_input jsonb,fingerprint_input text) returns void language plpgsql security definer set search_path='' as $$
declare r public.execution_runs%rowtype;
begin
 select * into r from public.execution_runs where id=run_input for update;if r.id is null or r.status<>'SAFETY_REVIEW' or r.claim_token is distinct from token_input or decision_input not in ('ALLOW','REQUIRES_APPROVAL','BLOCK') or decision_input is null then raise exception 'Invalid safety transition' using errcode='23514';end if;
 if not public.execution_binding_current(r) then decision_input:='BLOCK';codes_input:='["EXECUTION_BINDING_CHANGED"]';end if;
 if jsonb_typeof(codes_input) is distinct from 'array' or jsonb_array_length(codes_input)>30 or exists(select 1 from jsonb_array_elements(codes_input)v where jsonb_typeof(v)<>'string' or v#>>'{}' not in ('UNSAFE_PATH','UNSAFE_TARGET','UNSAFE_PORT','UNSAFE_LITERAL_PATH','CREDENTIAL_LITERAL_PATH','UNSUPPORTED_SYMBOLIC_INPUT','SOURCE_SCOPE_MISMATCH','AMBIGUOUS_OPERATION','BLOCKED_BY_DEPENDENCY','PATH_DATA_CONFIGURATION_REQUIRED','UNSUPPORTED_BODY_SCHEMA','SENSITIVE_BODY_FIELD','UNSUPPORTED_PARAMETER_LOCATION','UNSAFE_SYNTHETIC_BODY','REQUEST_LIMIT_OR_SECRET_HEADER','REQUEST_NOT_RUNNABLE','TARGET_DISABLED','PLANNING_NOT_READY','CREDENTIAL_CONFIGURATION_REQUIRED','UNSUPPORTED_METHOD','UNSAFE_DNS_ADDRESS','PRODUCTION_MUTATION_BLOCKED','EXECUTION_BINDING_CHANGED','EXPLICIT_EXECUTION_APPROVAL_REQUIRED','SAFE_READ')) or octet_length(coalesce(request_input,'{}')::text)>131072 then raise exception 'Safety payload bounds' using errcode='23514';end if;
 if facts_input is not null and (jsonb_typeof(facts_input) is distinct from 'object' or facts_input-array['environment','method','target','addresses']<>'{}'::jsonb) then raise exception 'Unsafe safety fact fields' using errcode='23514';end if;

 if facts_input ? 'addresses' and (jsonb_typeof(facts_input->'addresses') is distinct from 'array' or jsonb_array_length(facts_input->'addresses')>30 or exists(select 1 from jsonb_array_elements(facts_input->'addresses') a where jsonb_typeof(a)<>'string' or length(a#>>'{}')>45 or a#>>'{}' !~ '^[0-9a-fA-F:.]+$' or (a#>>'{}' not like '%.%' and a#>>'{}' not like '%:%'))) then raise exception 'Unsafe DNS fact representation' using errcode='23514';end if;
 facts_input:=jsonb_build_object('environment',(select type from public.environments where id=r.environment_id),'method',coalesce(request_input->>'method','UNKNOWN'),'target',(select substring(base_url from '^https?://[^/]+') from public.environment_execution_configs where id=r.config_id),'addresses',coalesce(facts_input->'addresses','[]'::jsonb));
 if request_input is not null and (jsonb_typeof(request_input) is distinct from 'object' or not(request_input ?& array['method','url','headers','body','operationPointer','assertions']) or request_input-array['method','url','headers','body','operationPointer','assertions']<>'{}'::jsonb or jsonb_typeof(request_input->'method') is distinct from 'string' or request_input->>'method' not in ('GET','HEAD','OPTIONS','POST','PUT','PATCH','DELETE') or jsonb_typeof(request_input->'url') is distinct from 'string' or request_input->>'url' !~ '^https?://' or jsonb_typeof(request_input->'operationPointer') is distinct from 'string' or jsonb_typeof(request_input->'headers') is distinct from 'object' or (request_input->'headers')-array['accept','content-type']<>'{}'::jsonb or jsonb_typeof(request_input->'body') not in ('null','string') or length(request_input->>'url')>2048 or request_input->>'url' ~* '(authorization|api[-_]?key|password|secret|token|cookie)=' or jsonb_typeof(request_input->'assertions') is distinct from 'array' or jsonb_array_length(request_input->'assertions')>30) then raise exception 'Unsafe persisted request' using errcode='23514';end if;
 if request_input is not null and (not public.execution_literal_safe(request_input->>'url') or not public.execution_literal_safe(request_input->>'operationPointer') or exists(select 1 from jsonb_each_text(request_input->'headers') h where not(h.key='accept' and h.value='application/json, text/plain' or h.key='content-type' and h.value='application/json'))) then raise exception 'Unsafe request literals' using errcode='23514';end if;
 if request_input is not null and not public.execution_request_assertions_safe(request_input->'assertions') then raise exception 'Unsafe assertion definitions' using errcode='23514';end if;
 if request_input is not null and request_input->'body'<>'null'::jsonb then begin if octet_length(request_input->>'body')>65536 or not public.execution_body_safe((request_input->>'body')::jsonb) then raise exception 'Unsafe request body' using errcode='23514';end if;exception when invalid_text_representation then raise exception 'Invalid structured body' using errcode='23514';end;end if;
 if decision_input<>'BLOCK' and (request_input is null or fingerprint_input !~ '^[a-f0-9]{64}$') then raise exception 'Authorized request required' using errcode='23514';end if;
 update public.execution_runs set decision=decision_input,policy_version='1.0.0',reason_codes=codes_input,facts=facts_input,request=request_input,fingerprint=fingerprint_input,status=case decision_input when 'ALLOW' then 'AUTHORIZED' when 'REQUIRES_APPROVAL' then 'PENDING_APPROVAL' else 'BLOCKED' end,claim_token=null where id=r.id;
 insert into public.execution_audit_events(workspace_id,run_id,system_actor,event) values(r.workspace_id,r.id,true,'SAFETY_EVALUATED');if decision_input<>'ALLOW' then insert into public.execution_audit_events(workspace_id,run_id,system_actor,event) values(r.workspace_id,r.id,true,case decision_input when 'BLOCK' then 'EXECUTION_BLOCKED' else 'EXECUTION_APPROVAL_REQUESTED' end);end if;
end;$$;


create function public.execution_capture_json_safe(v jsonb,depth integer default 0) returns boolean language plpgsql immutable set search_path='' as $$
declare e record;
begin
 if depth>9 then return false;end if;
 case jsonb_typeof(v)
 when 'null','number','boolean' then return true;
 when 'string' then return v#>>'{}'='[REDACTED]';
 when 'array' then if jsonb_array_length(v)>100 then return false;end if;for e in select value from jsonb_array_elements(v) loop if not public.execution_capture_json_safe(e.value,depth+1) then return false;end if;end loop;return true;
 when 'object' then if (select count(*) from jsonb_object_keys(v))>100 then return false;end if;for e in select key,value from jsonb_each(v) loop if e.key !~ '^field_[0-9]{1,2}$' or not public.execution_capture_json_safe(e.value,depth+1) then return false;end if;end loop;return true;
 else return false;end case;
end;$$;
create function public.execution_result_safe(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare r jsonb:=v->'response';a jsonb;h jsonb;b text;o text:=v->>'outcome';sent boolean;passes integer:=0;fails integer:=0;missing integer:=0;
begin
 if v is null or jsonb_typeof(v) is distinct from 'object' or not(v ?& array['outcome','failure','response','assertions','sent']) or v-array['outcome','failure','response','assertions','sent']<>'{}' or o not in ('PASSED','FAILED','ERROR','BLOCKED','CANCELLED','OBSERVED') or jsonb_typeof(v->'sent') is distinct from 'boolean' or jsonb_typeof(v->'assertions') is distinct from 'array' or jsonb_array_length(v->'assertions')>30 then return false;end if;
 sent:=(v->>'sent')::boolean;
 if v->'failure'<>'null' and (jsonb_typeof(v->'failure') is distinct from 'string' or v->>'failure' not in ('CANCELLED','TIMEOUT','BLOCK_REQUEST_NOT_RUNNABLE','SAFETY_BLOCKED','BLOCK_AUTHORIZATION_STALE','REQUEST_FINGERPRINT_CHANGED','TRANSPORT_FAILURE','RESPONSE_CAPTURE_FAILURE','RESPONSE_TOO_LARGE','REDIRECT_DISABLED','CONNECTION_TIMEOUT')) then return false;end if;
 if r<>'null' then
 if not sent or jsonb_typeof(r) is distinct from 'object' or not(r ?& array['status','headers','body','bodyHandling','contentType','bytes','durationMs','observedAt']) or r-array['status','headers','body','bodyHandling','contentType','bytes','durationMs','observedAt']<>'{}' or jsonb_typeof(r->'status') is distinct from 'number' or r->>'status' !~ '^[0-9]{3}$' or (r->>'status')::integer not between 100 and 599 or jsonb_typeof(r->'bytes') is distinct from 'number' or r->>'bytes' !~ '^[0-9]{1,9}$' or jsonb_typeof(r->'durationMs') is distinct from 'number' or r->>'durationMs' !~ '^[0-9]{1,6}$' or jsonb_typeof(r->'observedAt') is distinct from 'string' or r->>'observedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' or jsonb_typeof(r->'contentType') is distinct from 'string' or r->>'contentType' not in ('','application/json','text/plain','text/html','application/octet-stream') then return false;end if;
 h:=r->'headers';if jsonb_typeof(h) is distinct from 'object' or (select count(*) from jsonb_object_keys(h))>20 then return false;end if;
 if exists(select 1 from jsonb_each(h) e where e.key not in ('content-type','content-length','cache-control','date','accept','authorization','proxy-authorization','cookie','set-cookie','x-api-key','api-key') or jsonb_typeof(e.value)<>'string' or (e.key='content-type' and e.value#>>'{}' not in ('','application/json','text/plain','text/html','application/octet-stream','[REDACTED]')) or (e.key<>'content-type' and e.value#>>'{}'<>'[REDACTED]')) then return false;end if;
 b:=r->>'body';if r->'body'<>'null' and (jsonb_typeof(r->'body') is distinct from 'string' or octet_length(b)>1048576) then return false;end if;
 if r->>'bodyHandling'='JSON' then if r->'body'='null' or not public.execution_capture_json_safe(b::jsonb) then return false;end if;
 elsif r->>'bodyHandling'='TEXT' then if b is distinct from '[Text body withheld to prevent sensitive-data persistence]' then return false;end if;
 elsif r->>'bodyHandling'='REDACTED' then if b is distinct from '[Malformed JSON body withheld]' then return false;end if;
 elsif r->>'bodyHandling' in ('EMPTY','UNSUPPORTED') then if r->'body'<>'null' then return false;end if;
 else return false;end if;
 end if;
 for a in select value from jsonb_array_elements(v->'assertions') loop
 if jsonb_typeof(a) is distinct from 'object' or not(a ?& array['kind','expected','pointer','status','actual','reason']) or a-array['kind','expected','pointer','status','actual','reason']<>'{}' or jsonb_typeof(a->'kind') is distinct from 'string' or a->>'kind' not in ('STATUS_EQUALS','STATUS_IN_DECLARED_SET','CONTENT_TYPE','JSON_VALID','BODY_PRESENT','BODY_ABSENT','SCHEMA_TYPE','REQUIRED_PROPERTY','ENUM_VALUE','HEADER_PRESENT') or jsonb_typeof(a->'status') is distinct from 'string' or a->>'status' not in ('PASS','FAIL','NOT_EVALUATED') or jsonb_typeof(a->'pointer') is distinct from 'string' or length(a->>'pointer')>2048 or jsonb_typeof(a->'actual') is distinct from 'string' or a->>'actual' !~ '^(\[Value withheld\]|\[Not evaluated\]|true|false|[0-9]{1,3}|object|array|string|number|boolean|null|application/json|text/plain|text/html|application/octet-stream|)$' or jsonb_typeof(a->'reason') is distinct from 'string' or a->>'reason' not in ('Unsupported or absent body.','Compared observed response with declared assertion.') then return false;end if;
 if not public.execution_literal_safe(a->>'pointer') or octet_length((a->'expected')::text)>4096 then return false;end if;
 if a->>'kind'='STATUS_EQUALS' then if jsonb_typeof(a->'expected') is distinct from 'number' or a->>'expected' !~ '^[0-9]{3}$' then return false;end if;
 elsif a->>'kind'='STATUS_IN_DECLARED_SET' then if jsonb_typeof(a->'expected') is distinct from 'array' or jsonb_array_length(a->'expected')>100 or exists(select 1 from jsonb_array_elements(a->'expected') e where jsonb_typeof(e)<>'number' or e::text !~ '^[0-9]{3}$') then return false;end if;
 elsif not public.execution_capture_json_safe(a->'expected') then return false;end if;
 if a->>'status'='PASS' then passes:=passes+1;elsif a->>'status'='FAIL' then fails:=fails+1;else missing:=missing+1;end if;
 end loop;
 if o='PASSED' then return sent and r<>'null' and passes>0 and fails=0 and missing=0 and v->'failure'='null';end if;
 if o='FAILED' then return sent and r<>'null' and fails>0 and v->'failure'='null';end if;
 if o='OBSERVED' then return sent and r<>'null' and fails=0 and (passes=0 or missing>0) and v->'failure'='null';end if;
 if o='BLOCKED' then return v->>'failure' in ('BLOCK_REQUEST_NOT_RUNNABLE','SAFETY_BLOCKED','BLOCK_AUTHORIZATION_STALE','REQUEST_FINGERPRINT_CHANGED') and not sent and r='null' and jsonb_array_length(v->'assertions')=0 and v->'failure'<>'null';end if;
 if o in ('ERROR','CANCELLED') then return (o='CANCELLED' and v->>'failure'='CANCELLED' or o='ERROR' and v->>'failure' in ('TIMEOUT','TRANSPORT_FAILURE','RESPONSE_CAPTURE_FAILURE','RESPONSE_TOO_LARGE','REDIRECT_DISABLED','CONNECTION_TIMEOUT')) and v->'failure'<>'null' and jsonb_array_length(v->'assertions')=0 and (r='null' or o='ERROR' and v->>'failure'='RESPONSE_TOO_LARGE' and r->'body'='null');end if;
 return false;
 exception when others then return false;
end;$$;
revoke all on function public.execution_capture_json_safe(jsonb,integer),public.execution_result_safe(jsonb) from public,anon,authenticated,service_role,testpilot_runner;
create function public.finish_test_execution(run_input uuid,token_input uuid,result_input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.execution_runs%rowtype;outcome text:=result_input->>'outcome';
begin
 select * into r from public.execution_runs where id=run_input for update;if r.id is null or r.status<>'RUNNING' or r.claim_token is distinct from token_input then raise exception 'Invalid result transition' using errcode='23514';end if;
 if result_input->'sent'='true'::jsonb and r.send_authorized_at is null then raise exception 'No send authorization evidence' using errcode='23514';end if;
 if public.execution_result_safe(result_input) is distinct from true then raise exception 'Unsafe or inconsistent execution result' using errcode='23514';end if;
 if outcome in ('PASSED','FAILED','OBSERVED') and (coalesce((select jsonb_agg(a-array['status','actual','reason']) from jsonb_array_elements(result_input->'assertions') a),'[]') is distinct from r.request->'assertions' or exists(select 1 from jsonb_array_elements(result_input->'assertions') a where a->>'actual' is distinct from result_input->'response'->>'status' or a->>'status' is distinct from (case when a->'expected' @> jsonb_build_array((result_input->'response'->>'status')::integer) then 'PASS' else 'FAIL' end))) then raise exception 'Assertions do not match authorized request and observation' using errcode='23514';end if;

 if result_input is null or jsonb_typeof(result_input)<>'object' or not(result_input ?& array['outcome','failure','response','assertions','sent']) or result_input-array['outcome','failure','response','assertions','sent']<>'{}'::jsonb or outcome is null or outcome not in ('PASSED','FAILED','ERROR','BLOCKED','CANCELLED','OBSERVED') or jsonb_typeof(result_input->'sent') is distinct from 'boolean' or jsonb_typeof(result_input->'assertions') is distinct from 'array' or jsonb_array_length(result_input->'assertions')>30 or octet_length(result_input::text)>1200000 then raise exception 'Result payload bounds' using errcode='23514';end if;
 if result_input->'response'<>'null'::jsonb and (jsonb_typeof(result_input->'response'->'headers') is distinct from 'object' or exists(select 1 from jsonb_each_text(result_input->'response'->'headers') h where h.key ~* '(authorization|cookie|api[-_]?key|token|secret)' and h.value<>'[REDACTED]') or length(result_input->'response'->>'body')>1048576) then raise exception 'Unsafe response representation' using errcode='23514';end if;
 if result_input->'sent'='false'::jsonb and result_input->'response'<>'null'::jsonb then raise exception 'No evidence without sent request' using errcode='23514';end if;
 insert into public.execution_results(run_id,workspace_id,result) values(r.id,r.workspace_id,result_input);
 update public.execution_runs set status=case outcome when 'ERROR' then 'ERROR' when 'BLOCKED' then 'BLOCKED' when 'CANCELLED' then 'CANCELLED' else 'COMPLETED' end,completed_at=clock_timestamp(),claim_token=null where id=r.id;
 insert into public.execution_audit_events(workspace_id,run_id,system_actor,event) values(r.workspace_id,r.id,true,case outcome when 'ERROR' then 'EXECUTION_FAILED' when 'BLOCKED' then 'EXECUTION_BLOCKED' when 'CANCELLED' then 'EXECUTION_CANCELLED' else 'EXECUTION_COMPLETED' end);
end;$$;

-- Send is authorized at this RPC's snapshot. Changes committed after this boundary
-- cannot undo a send; the worker calls it after DNS and immediately before connection.
create function public.authorize_execution_send(run_input uuid,token_input uuid,fingerprint_input text,config_input uuid,policy_input text) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.execution_runs%rowtype;
begin
 select * into r from public.execution_runs where id=run_input for update;
 if r.send_authorized_at is not null then return false;end if;
 if coalesce(r.id is not null and r.status='RUNNING' and not r.cancel_requested and r.claim_token=token_input and r.fingerprint=fingerprint_input and r.config_id=config_input and r.policy_version=policy_input and policy_input='1.0.0' and public.execution_binding_current(r) and exists(select 1 from public.environment_execution_configs c where c.id=r.config_id and c.enabled) and (r.decision='ALLOW' or r.decision='REQUIRES_APPROVAL' and r.approved_by is not null and r.approved_fingerprint=r.fingerprint),false) then
 update public.execution_runs set send_authorized_at=clock_timestamp() where id=r.id;
 insert into public.execution_audit_events(workspace_id,run_id,system_actor,event) values(r.workspace_id,r.id,true,'EXECUTION_SEND_AUTHORIZED');
 return true;end if;return false;
end;$$;
revoke all on function public.authorize_execution_send(uuid,uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.authorize_execution_send(uuid,uuid,text,uuid,text) to testpilot_runner;

-- Active cancellation polling exposes only token-owned jobs to the runner.
create function public.execution_cancel_requested(run_input uuid,token_input uuid) returns boolean language sql security definer set search_path='' as $$ select coalesce((select cancel_requested or not public.execution_binding_current(execution_runs) from public.execution_runs where id=run_input and claim_token=token_input and status='RUNNING'),true);$$;
revoke all on function public.execution_planning_ready(uuid),public.execution_binding_current(public.execution_runs),public.execution_worker_context(public.execution_runs) from public,anon,authenticated,service_role,testpilot_runner;
revoke all on function public.configure_execution_environment(uuid,text,integer,boolean,integer,integer),public.request_test_execution(uuid,uuid),public.decide_execution_approval(uuid,text,boolean),public.cancel_test_execution(uuid) from public,anon,service_role,testpilot_runner;
grant execute on function public.configure_execution_environment(uuid,text,integer,boolean,integer,integer),public.request_test_execution(uuid,uuid),public.decide_execution_approval(uuid,text,boolean),public.cancel_test_execution(uuid) to authenticated;
revoke all on function public.claim_test_execution(),public.record_execution_safety(uuid,uuid,text,jsonb,jsonb,jsonb,text),public.finish_test_execution(uuid,uuid,jsonb),public.execution_cancel_requested(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_test_execution(),public.record_execution_safety(uuid,uuid,text,jsonb,jsonb,jsonb,text),public.finish_test_execution(uuid,uuid,jsonb),public.execution_cancel_requested(uuid,uuid) to testpilot_runner;
select public.validate_execution_runner_role();
commit;