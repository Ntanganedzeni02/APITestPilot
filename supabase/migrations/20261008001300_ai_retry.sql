begin;
-- Preserve every prior reservation. Only confirmed terminal transient failures
-- release fingerprint deduplication, never daily liability or rolling admission.
alter table public.ai_reasoning_requests drop constraint ai_reasoning_requests_error_code_check;
alter table public.ai_reasoning_requests add constraint ai_reasoning_requests_error_code_check check(error_code in('INVALID_KEY','CREDITS','RATE_LIMIT','PROVIDER','PROVIDER_TRANSIENT','PRE_SEND','NETWORK','TIMEOUT','CANCELLED','REFUSAL','TRUNCATED','VALIDATION','USAGE_UNCERTAIN'));
alter table public.ai_reasoning_requests drop constraint ai_reasoning_requests_project_id_workflow_anchor_id_model_c_key;
create unique index ai_reasoning_protected_fingerprint on public.ai_reasoning_requests(project_id,workflow,anchor_id,model,context_hash)
 where not (state='FAILED' and coalesce(error_code in('RATE_LIMIT','PROVIDER_TRANSIENT','PRE_SEND'),false));
create or replace function public.admit_ai_reasoning(project_input uuid,source_input uuid,workflow_input text,anchor_input uuid,model_input text,hash_input text) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();w uuid;row public.ai_reasoning_requests%rowtype;day_start timestamptz;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501';end if;
 select workspace_id into w from public.projects where id=project_input;
 if w is null or not public.is_workspace_member(w) then raise exception 'Resource unavailable' using errcode='42501';end if;
 -- Membership and project rows fence concurrent revocation/scope changes through admission.
 perform 1 from public.workspace_members where workspace_id=w and user_id=caller for share;
 if not found then raise exception 'Resource unavailable' using errcode='42501';end if;
 perform 1 from public.projects where id=project_input and workspace_id=w for share;
 if model_input is null or model_input not in('gpt-4.1-mini','gpt-4.1-mini-2025-04-14') or hash_input is null or hash_input !~ '^[a-f0-9]{64}$' then raise exception 'Invalid bounded request' using errcode='23514';end if;
 if source_input is distinct from (select id from public.api_imports where project_id=project_input and workspace_id=w order by created_at desc,id desc limit 1) then raise exception 'Current source required' using errcode='23514';end if;
 if workflow_input='PLANNING' then
  if not exists(select 1 from public.qa_analyses where id=anchor_input and project_id=project_input and workspace_id=w and api_import_id=source_input) then raise exception 'Analysis unavailable' using errcode='23514';end if;
 elsif workflow_input='INVESTIGATION' then
  if not exists(select 1 from public.investigations i join public.evidence_packages e on e.id=i.source_package_id join public.execution_runs r on r.id=e.run_id where i.id=anchor_input and i.workspace_id=w and i.project_id=project_input and r.api_import_id=source_input and i.status in('OPEN','WAITING_FOR_APPROVAL','RUNNING') and i.expires_at>clock_timestamp() and (select count(*) from public.investigation_proposals where investigation_id=i.id)<8) then raise exception 'Investigation unavailable or budget exhausted' using errcode='23514';end if;
 else raise exception 'Unknown workflow' using errcode='23514';end if;
 -- Serialize all admitted requests within this workspace, across users/processes/instances.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(w::text,12003));
 if exists(select 1 from public.ai_reasoning_requests where project_id=project_input and workflow=workflow_input and anchor_id=anchor_input and model=model_input and context_hash=hash_input and not (state='FAILED' and coalesce(error_code in('RATE_LIMIT','PROVIDER_TRANSIENT','PRE_SEND'),false))) then raise exception 'Duplicate reasoning request' using errcode='23505';end if;
 day_start:=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
 -- All attempts consume their full worst-case reservation, including failures/crashes.
 -- Completed/failed calls cannot free rolling admission slots prematurely.
 if (select count(*) from public.ai_reasoning_requests where workspace_id=w and created_at>=day_start)>=20
 or (select sum(reserved_micro_usd) from public.ai_reasoning_requests where workspace_id=w and created_at>=day_start)>=224000
 or (select count(*) from public.ai_reasoning_requests where project_id=project_input and created_at>=day_start)>=10
 or (select count(*) from public.ai_reasoning_requests where workspace_id=w and created_by=caller and created_at>=day_start)>=10
 or (select count(*) from public.ai_reasoning_requests where workspace_id=w and created_at>clock_timestamp()-interval '120 seconds')>=2
 or (select count(*) from public.ai_reasoning_requests where project_id=project_input and created_at>clock_timestamp()-interval '120 seconds')>=1 then raise exception 'Reasoning budget unavailable' using errcode='54000';end if;
 insert into public.ai_reasoning_requests(workspace_id,project_id,api_import_id,created_by,workflow,anchor_id,model,context_hash) values(w,project_input,source_input,caller,workflow_input,anchor_input,model_input,hash_input) returning * into row;
 return jsonb_build_object('id',row.id,'nonce',row.nonce,'createdAt',row.created_at);
end;$$;
-- CREATE OR REPLACE preserves ownership and ACLs; make intended grants explicit.
revoke all on function public.admit_ai_reasoning(uuid,uuid,text,uuid,text,text) from public,anon,authenticated,service_role,testpilot_runner;
grant execute on function public.admit_ai_reasoning(uuid,uuid,text,uuid,text,text) to authenticated;
select public.validate_execution_runner_role();
commit;
