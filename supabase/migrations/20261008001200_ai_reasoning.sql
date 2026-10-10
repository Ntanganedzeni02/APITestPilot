begin;
-- Reasoning receipts are usage metadata, never execution evidence or release authority.
create table public.ai_reasoning_requests (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null, api_import_id uuid not null,
 created_by uuid not null, workflow text not null check(workflow in('PLANNING','INVESTIGATION')),
 anchor_id uuid not null, model text not null check(model in('gpt-4.1-mini','gpt-4.1-mini-2025-04-14')),
 context_hash text not null check(context_hash ~ '^[a-f0-9]{64}$'), nonce uuid not null default gen_random_uuid(),
 state text not null default 'RESERVED' check(state in('RESERVED','COMPLETED','FAILED','UNCERTAIN')),
 reserved_input_tokens integer not null default 12000 check(reserved_input_tokens=12000),
 reserved_output_tokens integer not null default 4000 check(reserved_output_tokens=4000),
 reserved_micro_usd integer not null default 11200 check(reserved_micro_usd=11200),
 input_tokens integer check(input_tokens between 0 and 12000), output_tokens integer check(output_tokens between 0 and 4000),
 usage_estimated boolean not null default true, response_id text check(response_id ~ '^resp_[A-Za-z0-9_-]{1,190}$'),
 error_code text check(error_code in('INVALID_KEY','CREDITS','RATE_LIMIT','PROVIDER','NETWORK','TIMEOUT','CANCELLED','REFUSAL','TRUNCATED','VALIDATION','USAGE_UNCERTAIN')),
 result_id uuid, created_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 check((state='RESERVED' and completed_at is null and result_id is null) or (state in('COMPLETED','FAILED','UNCERTAIN') and completed_at is not null)),
 check((state='COMPLETED')=(result_id is not null)),
 check(not usage_estimated or (input_tokens is null and output_tokens is null)),
 foreign key(api_import_id,project_id,workspace_id) references public.api_imports(id,project_id,workspace_id),
 unique(project_id,workflow,anchor_id,model,context_hash)
);
create index ai_reasoning_workspace_usage on public.ai_reasoning_requests(workspace_id,created_at);
create index ai_reasoning_project_usage on public.ai_reasoning_requests(project_id,created_at);
alter table public.ai_reasoning_requests enable row level security;
create policy ai_reasoning_read on public.ai_reasoning_requests for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.ai_reasoning_requests from public,anon,authenticated,service_role,testpilot_runner;
grant select(id,workspace_id,project_id,api_import_id,created_by,workflow,anchor_id,model,context_hash,state,reserved_input_tokens,reserved_output_tokens,reserved_micro_usd,input_tokens,output_tokens,usage_estimated,response_id,error_code,result_id,created_at,completed_at) on public.ai_reasoning_requests to authenticated;
create function public.admit_ai_reasoning(project_input uuid,source_input uuid,workflow_input text,anchor_input uuid,model_input text,hash_input text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if exists(select 1 from public.ai_reasoning_requests where project_id=project_input and workflow=workflow_input and anchor_id=anchor_input and model=model_input and context_hash=hash_input) then raise exception 'Duplicate reasoning request' using errcode='23505';end if;
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
create function public.complete_ai_reasoning(request_input uuid,nonce_input uuid,state_input text,usage_input jsonb,payload_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();r public.ai_reasoning_requests%rowtype;result uuid;input_count integer;output_count integer;estimated boolean;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into r from public.ai_reasoning_requests where id=request_input for update;
 if r.id is null or r.created_by<>caller or r.nonce is distinct from nonce_input or not public.is_workspace_member(r.workspace_id) then raise exception 'Resource unavailable' using errcode='42501';end if;
 if r.state<>'RESERVED' then raise exception 'Request already settled' using errcode='40001';end if;
 perform 1 from public.workspace_members where workspace_id=r.workspace_id and user_id=caller for share;
 if not found then raise exception 'Resource unavailable' using errcode='42501';end if;
 if state_input is null or state_input not in('COMPLETED','FAILED','UNCERTAIN') or usage_input is null or jsonb_typeof(usage_input)<>'object' or usage_input-array['inputTokens','outputTokens','responseId','errorCode']<>'{}'::jsonb or octet_length(usage_input::text)>1000 then raise exception 'Invalid receipt' using errcode='23514';end if;
 if exists(select 1 from jsonb_each(usage_input) x where x.key in('inputTokens','outputTokens') and x.value<>'null'::jsonb and (jsonb_typeof(x.value)<>'number' or x.value::text !~ '^[0-9]+$')) then raise exception 'Invalid token counts' using errcode='23514';end if;
 if usage_input->'inputTokens' is not null and usage_input->'inputTokens'<>'null'::jsonb then input_count:=(usage_input->>'inputTokens')::integer;end if;
 if usage_input->'outputTokens' is not null and usage_input->'outputTokens'<>'null'::jsonb then output_count:=(usage_input->>'outputTokens')::integer;end if;
 estimated:=input_count is null or output_count is null;
 if estimated then input_count:=null;output_count:=null;end if;
 if state_input='COMPLETED' then
  if r.created_at+interval '120 seconds'<=clock_timestamp() or r.api_import_id is distinct from (select id from public.api_imports where project_id=r.project_id order by created_at desc,id desc limit 1) then raise exception 'Reasoning scope expired' using errcode='40001';end if;
  if payload_input is null or octet_length(payload_input::text)>1048576 then raise exception 'Invalid proposal payload' using errcode='23514';end if;
  if r.workflow='PLANNING' then
   if payload_input->>'workspaceId' is distinct from r.workspace_id::text or payload_input->>'projectId' is distinct from r.project_id::text or payload_input->>'importId' is distinct from r.api_import_id::text or payload_input->>'analysisId' is distinct from r.anchor_id::text or payload_input->>'aiStatus' is distinct from 'SUCCEEDED' or payload_input->'aiMetadata'->>'provider' is distinct from 'openai' or payload_input->'aiMetadata'->>'model' is distinct from r.model then raise exception 'Invalid AI provenance' using errcode='23514';end if;
   if (select count(*) from jsonb_array_elements(payload_input->'items') x where x->>'origin'='AI_PROPOSED') not between 1 and 10 then raise exception 'AI proposal bounds' using errcode='23514';end if;
   if exists(select 1 from jsonb_array_elements(payload_input->'items') x where x->>'origin'='AI_PROPOSED' and (x->'executable' is distinct from 'false'::jsonb or x->>'derivationType'<>'AI_INFERENCE')) then raise exception 'AI cannot authorize execution' using errcode='23514';end if;
   result:=public.create_test_plan(r.anchor_id,payload_input);
  else result:=public.persist_investigation_proposal(r.anchor_id,payload_input);end if;
 elsif payload_input is not null and payload_input<>'null'::jsonb then raise exception 'Failed requests cannot persist proposals' using errcode='23514';end if;
 update public.ai_reasoning_requests set state=state_input,input_tokens=input_count,output_tokens=output_count,usage_estimated=estimated,response_id=usage_input->>'responseId',error_code=usage_input->>'errorCode',result_id=result,completed_at=clock_timestamp() where id=r.id;
 return result;
end;$$;
revoke all on function public.admit_ai_reasoning(uuid,uuid,text,uuid,text,text),public.complete_ai_reasoning(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role,testpilot_runner;
grant execute on function public.admit_ai_reasoning(uuid,uuid,text,uuid,text,text),public.complete_ai_reasoning(uuid,uuid,text,jsonb,jsonb) to authenticated;
select public.validate_execution_runner_role();
commit;
