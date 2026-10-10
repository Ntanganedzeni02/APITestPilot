-- Resolve the five reported UUID prefixes to actual database UUIDs and actual workspace/project names.
-- Actor UID retains the user-supplied value from the previous Dashboard query. Confirm it is your signed-in TestPilot actor.
-- Leave exact_context_hash NULL. Prefer DATABASE_ADMISSION_CANDIDATE with zero attempts.
-- READ ONLY. Supabase Dashboard SQL Editor or an approved read-only connection.
-- No admission RPC is called and no reservation is created.
-- Supply the actor UUID from your authenticated TestPilot account, not a token.
-- Supply a context hash ONLY if computed from the exact authorized application
-- groundedPlanningCatalog(context).request.data using SHA256(JSON.stringify(data)).
-- Never invent a hash. With no previous attempts for an analysis, a hash is not
-- needed to establish that its fingerprint is not already recorded.
-- Replace analysis_id only with an existing, legitimately reviewed analysis.
begin read only;
with parameters as (
select '162ab497-f635-4708-9f35-0c11c4326a07'::uuid as actor_id, null::text as exact_context_hash), scope as (
 select q.id as analysis_id,q.created_at as analysis_created_at,workspace.name as workspace_name,project.name as project_name,q.workspace_id,q.project_id,q.api_import_id,
 q.api_import_id=(select i.id from public.api_imports i where i.workspace_id=q.workspace_id and i.project_id=q.project_id order by i.created_at desc,i.id desc limit 1) as current_source,
 (select count(*) from public.qa_items i where i.analysis_id=q.id and i.kind='REQUIREMENT' and (select r.decision from public.qa_reviews r where r.item_id=i.id order by r.revision desc limit 1)='APPROVE') as approved_requirements,
 (select count(*) from public.behaviour_graph_nodes n where n.graph_id=q.behaviour_graph_id and n.type='OPERATION') as operation_count,
 p.actor_id,p.exact_context_hash
 from public.qa_analyses q cross join parameters p
 join public.projects project on project.id=q.project_id and project.workspace_id=q.workspace_id
 join public.workspaces workspace on workspace.id=q.workspace_id
 where left(q.id::text,8) in ('48bc28d0','8606d094','5a99204a','fe6f94be','099bc4a6')
), facts as (
 select s.*,
 exists(select 1 from public.workspace_members m where m.workspace_id=s.workspace_id and m.user_id=s.actor_id) as member_authorized,
 (select count(*) from public.ai_reasoning_requests r where r.project_id=s.project_id and r.workflow='PLANNING' and r.anchor_id=s.analysis_id and r.model='gpt-4.1-mini') as analysis_attempts,
 (select count(*) from public.ai_reasoning_requests r where r.project_id=s.project_id and r.workflow='PLANNING' and r.anchor_id=s.analysis_id and r.model='gpt-4.1-mini' and (s.exact_context_hash is null or r.context_hash=s.exact_context_hash) and not (r.state='FAILED' and coalesce(r.error_code in('RATE_LIMIT','PROVIDER_TRANSIENT','PRE_SEND'),false))) as protected_fingerprints,
 (select count(*) from public.ai_reasoning_requests r where r.workspace_id=s.workspace_id and r.created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC') as workspace_daily,
 (select coalesce(sum(r.reserved_micro_usd),0) from public.ai_reasoning_requests r where r.workspace_id=s.workspace_id and r.created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC') as daily_reserved_micro_usd,
 (select count(*) from public.ai_reasoning_requests r where r.project_id=s.project_id and r.created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC') as project_daily,
 (select count(*) from public.ai_reasoning_requests r where r.workspace_id=s.workspace_id and r.created_by=s.actor_id and r.created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC') as actor_daily,
 (select count(*) from public.ai_reasoning_requests r where r.workspace_id=s.workspace_id and r.created_at>clock_timestamp()-interval '120 seconds') as workspace_rolling,
 (select count(*) from public.ai_reasoning_requests r where r.project_id=s.project_id and r.created_at>clock_timestamp()-interval '120 seconds') as project_rolling,
 (select count(*) from public.ai_reasoning_requests r where r.workspace_id=s.workspace_id and r.state='RESERVED') as unresolved_reserved,
 (select count(*) from public.ai_reasoning_requests r where r.workspace_id=s.workspace_id and r.state='UNCERTAIN') as unresolved_uncertain
 from scope s
)
select analysis_id,analysis_created_at,workspace_name,project_name,current_source,approved_requirements,operation_count,
 member_authorized,analysis_attempts,protected_fingerprints,
 (select coalesce(jsonb_agg(jsonb_build_object('state',r.state,'error',r.error_code,'fingerprint',r.context_hash) order by r.created_at desc),'[]'::jsonb) from public.ai_reasoning_requests r where r.project_id=facts.project_id and r.workflow='PLANNING' and r.anchor_id=facts.analysis_id and r.model='gpt-4.1-mini') as prior_fingerprints,
 greatest(20-workspace_daily,0) as workspace_daily_slots,
 greatest(224000-daily_reserved_micro_usd,0) as workspace_daily_budget_micro_usd,
 greatest(10-project_daily,0) as project_daily_slots,
 case when actor_id is not null then greatest(10-actor_daily,0) end as actor_daily_slots,
 workspace_rolling,project_rolling,unresolved_reserved,unresolved_uncertain,
 case
 when not current_source or approved_requirements=0 or operation_count=0 then 'BLOCKED'
 when actor_id is null then 'UNVERIFIED_ACTOR'
 when not member_authorized then 'BLOCKED'
 when workspace_daily>=20 or daily_reserved_micro_usd>=224000 or project_daily>=10 or actor_daily>=10 or workspace_rolling>=2 or project_rolling>=1 then 'BLOCKED_BUDGET_OR_COOLDOWN'
 when protected_fingerprints>0 and exact_context_hash is null then 'UNVERIFIED_EXACT_CONTEXT'
 when protected_fingerprints>0 then 'BLOCKED_FINGERPRINT'
 when exact_context_hash is not null and exact_context_hash !~ '^[a-f0-9]{64}$' then 'UNVERIFIED_EXACT_CONTEXT'
 else 'DATABASE_ADMISSION_CANDIDATE'
 end as readiness
from facts order by (analysis_attempts=0) desc,analysis_created_at desc,analysis_id;
commit;
-- Empty results mean the specified analysis is unavailable/nonexistent.
-- This snapshot cannot reserve capacity or guarantee later concurrent admission.
-- The authenticated application admission RPC remains the final authority.
