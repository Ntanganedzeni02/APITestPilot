begin;
create table public.test_plans (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,project_id uuid not null,api_import_id uuid not null,behaviour_graph_id uuid not null,qa_analysis_id uuid not null,
 engine_version text not null check(engine_version='1.0.0'),status text not null default 'DRAFT' check(status='DRAFT'),ai_status text not null check(ai_status in ('NOT_CONFIGURED','SUCCEEDED','FAILED')),ai_metadata jsonb,ai_failure text check(length(ai_failure)<=500),created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 unique(id,qa_analysis_id,workspace_id),unique(id,behaviour_graph_id,api_import_id,project_id,workspace_id),
 check((ai_status='SUCCEEDED' and jsonb_typeof(ai_metadata)='object') or (ai_status<>'SUCCEEDED' and ai_metadata is null)),
 foreign key(qa_analysis_id,behaviour_graph_id,api_import_id,project_id,workspace_id) references public.qa_analyses(id,behaviour_graph_id,api_import_id,project_id,workspace_id)
);
create table public.test_requirement_versions (
 plan_id uuid not null,qa_analysis_id uuid not null,workspace_id uuid not null,requirement_id uuid not null,kind text not null default 'REQUIREMENT' check(kind='REQUIREMENT'),review_id uuid references public.qa_reviews(id),status text not null check(status in ('PROPOSED','APPROVED','REJECTED')),title text not null check(length(title) between 1 and 160),statement text not null check(length(statement) between 1 and 4000),source_kind text not null check(source_kind in ('SPEC_EXPLICIT','GRAPH_DERIVED','AI_PROPOSED','HUMAN_AUTHORED')),has_edits boolean not null,primary key(plan_id,requirement_id),
 foreign key(plan_id,qa_analysis_id,workspace_id) references public.test_plans(id,qa_analysis_id,workspace_id),foreign key(requirement_id,qa_analysis_id,kind) references public.qa_items(id,analysis_id,kind)
);
create table public.test_items (
 id uuid primary key default gen_random_uuid(),plan_id uuid not null,qa_analysis_id uuid not null,workspace_id uuid not null,kind text not null check(kind in ('SCENARIO','CASE')),logical_key text not null check(octet_length(logical_key) between 1 and 4000),scenario_id uuid,scenario_kind text not null default 'SCENARIO' check(scenario_kind='SCENARIO'),definition jsonb not null check(jsonb_typeof(definition)='object' and octet_length(definition::text)<=65536),origin text not null check(origin in ('DETERMINISTIC','AI_PROPOSED','HUMAN_AUTHORED')),created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 check((kind='SCENARIO' and scenario_id is null) or (kind='CASE' and scenario_id is not null)),unique(plan_id,logical_key),unique(id,plan_id,kind),unique(id,plan_id,qa_analysis_id,workspace_id),
 foreign key(plan_id,qa_analysis_id,workspace_id) references public.test_plans(id,qa_analysis_id,workspace_id),foreign key(scenario_id,plan_id,scenario_kind) references public.test_items(id,plan_id,kind)
);
create table public.test_item_qa_links (
 item_id uuid not null,plan_id uuid not null,qa_analysis_id uuid not null,workspace_id uuid not null,qa_item_id uuid not null,qa_kind text not null check(qa_kind in ('REQUIREMENT','RISK')),primary key(item_id,qa_item_id),foreign key(item_id,plan_id,qa_analysis_id,workspace_id) references public.test_items(id,plan_id,qa_analysis_id,workspace_id),foreign key(qa_item_id,qa_analysis_id,qa_kind) references public.qa_items(id,analysis_id,kind)
);
create table public.test_item_nodes (
 item_id uuid not null,plan_id uuid not null,qa_analysis_id uuid not null,workspace_id uuid not null,behaviour_graph_id uuid not null,api_import_id uuid not null,project_id uuid not null,node_id text not null,primary key(item_id,node_id),foreign key(item_id,plan_id,qa_analysis_id,workspace_id) references public.test_items(id,plan_id,qa_analysis_id,workspace_id),foreign key(plan_id,behaviour_graph_id,api_import_id,project_id,workspace_id) references public.test_plans(id,behaviour_graph_id,api_import_id,project_id,workspace_id),foreign key(behaviour_graph_id,node_id,api_import_id,project_id,workspace_id) references public.behaviour_graph_nodes(graph_id,logical_id,api_import_id,project_id,workspace_id)
);
create table public.test_item_edges (
 item_id uuid not null,plan_id uuid not null,qa_analysis_id uuid not null,workspace_id uuid not null,behaviour_graph_id uuid not null,api_import_id uuid not null,project_id uuid not null,edge_id text not null,primary key(item_id,edge_id),foreign key(item_id,plan_id,qa_analysis_id,workspace_id) references public.test_items(id,plan_id,qa_analysis_id,workspace_id),foreign key(plan_id,behaviour_graph_id,api_import_id,project_id,workspace_id) references public.test_plans(id,behaviour_graph_id,api_import_id,project_id,workspace_id),foreign key(behaviour_graph_id,edge_id) references public.behaviour_graph_edges(graph_id,logical_id)
);
create table public.test_reviews (
 id uuid primary key default gen_random_uuid(),item_id uuid not null,plan_id uuid not null,qa_analysis_id uuid not null,workspace_id uuid not null,revision integer not null check(revision>0),actor_id uuid not null references auth.users(id),created_at timestamptz not null default now(),decision text not null check(decision in ('APPROVE','REJECT','EDIT')),rationale text not null check(length(rationale)<=2000),title text,objective text,expected_behavior text,
 check((decision='EDIT' and title is not null and objective is not null and expected_behavior is not null and length(title) between 1 and 160 and title=btrim(title) and length(objective) between 1 and 4000 and objective=btrim(objective) and length(expected_behavior) between 1 and 4000 and expected_behavior=btrim(expected_behavior)) or (decision<>'EDIT' and title is null and objective is null and expected_behavior is null)),unique(item_id,revision),foreign key(item_id,plan_id,qa_analysis_id,workspace_id) references public.test_items(id,plan_id,qa_analysis_id,workspace_id)
);
create table public.test_audit_events (
 id uuid primary key default gen_random_uuid(),plan_id uuid not null,qa_analysis_id uuid not null,workspace_id uuid not null,item_id uuid,actor_id uuid not null references auth.users(id),event text not null check(event in ('PLAN_CREATED','SCENARIO_APPROVE','SCENARIO_REJECT','SCENARIO_EDIT','CASE_APPROVE','CASE_REJECT','CASE_EDIT','HUMAN_SCENARIO_ADDED','HUMAN_CASE_ADDED')),created_at timestamptz not null default now(),foreign key(plan_id,qa_analysis_id,workspace_id) references public.test_plans(id,qa_analysis_id,workspace_id),foreign key(item_id,plan_id,qa_analysis_id,workspace_id) references public.test_items(id,plan_id,qa_analysis_id,workspace_id)
);
create index test_plan_history on public.test_plans(workspace_id,project_id,created_at desc,id);
create index test_item_history on public.test_items(workspace_id,plan_id,kind,logical_key);
create index test_qa_reverse on public.test_item_qa_links(workspace_id,qa_item_id);
create index test_node_reverse on public.test_item_nodes(workspace_id,behaviour_graph_id,node_id);
create index test_edge_reverse on public.test_item_edges(workspace_id,behaviour_graph_id,edge_id);
create index test_review_history on public.test_reviews(workspace_id,item_id,revision);
create index test_audit_history on public.test_audit_events(workspace_id,plan_id,created_at);
-- Explicit policies avoid dynamic SQL in privileged migration functions.
alter table public.test_plans enable row level security;
create policy test_plans_read on public.test_plans for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.test_plans from public,anon,authenticated;
grant select on public.test_plans to authenticated;
alter table public.test_requirement_versions enable row level security;
create policy test_requirement_versions_read on public.test_requirement_versions for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.test_requirement_versions from public,anon,authenticated;
grant select on public.test_requirement_versions to authenticated;
alter table public.test_items enable row level security;
create policy test_items_read on public.test_items for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.test_items from public,anon,authenticated;
grant select on public.test_items to authenticated;
alter table public.test_item_qa_links enable row level security;
create policy test_item_qa_links_read on public.test_item_qa_links for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.test_item_qa_links from public,anon,authenticated;
grant select on public.test_item_qa_links to authenticated;
alter table public.test_item_nodes enable row level security;
create policy test_item_nodes_read on public.test_item_nodes for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.test_item_nodes from public,anon,authenticated;
grant select on public.test_item_nodes to authenticated;
alter table public.test_item_edges enable row level security;
create policy test_item_edges_read on public.test_item_edges for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.test_item_edges from public,anon,authenticated;
grant select on public.test_item_edges to authenticated;
alter table public.test_reviews enable row level security;
create policy test_reviews_read on public.test_reviews for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.test_reviews from public,anon,authenticated;
grant select on public.test_reviews to authenticated;
alter table public.test_audit_events enable row level security;
create policy test_audit_events_read on public.test_audit_events for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.test_audit_events from public,anon,authenticated;
grant select on public.test_audit_events to authenticated;

create function public.test_insert_item(target_plan uuid,p jsonb,caller uuid,manual_addition boolean) returns uuid language plpgsql set search_path='' as $$
declare a public.test_plans%rowtype;result uuid;parent uuid;ref jsonb;doc jsonb;key text;version public.test_requirement_versions%rowtype;source_ai boolean:=true;
begin
 select * into strict a from public.test_plans where id=target_plan;
 if p is null or jsonb_typeof(p)<>'object' or not (p ?& array['logicalKey','kind','scenarioKey','title','objective','testType','caseType','priority','priorityReason','origin','derivationType','confidence','ruleId','reason','requirementRefs','riskRefs','nodeRefs','edgeRefs','sourcePointers','preconditions','input','expectedBehavior','executable']) or octet_length(p::text)>65536 or p-array['logicalKey','kind','scenarioKey','title','objective','testType','caseType','priority','priorityReason','origin','derivationType','confidence','ruleId','reason','requirementRefs','riskRefs','nodeRefs','edgeRefs','sourcePointers','preconditions','input','expectedBehavior','executable']<>'{}'::jsonb then raise exception 'Invalid planning item' using errcode='23514';end if;
 foreach key in array array['logicalKey','kind','title','objective','testType','priority','priorityReason','origin','derivationType','confidence','ruleId','reason','expectedBehavior'] loop if jsonb_typeof(p->key) is distinct from 'string' then raise exception 'Invalid planning text' using errcode='23514';end if;end loop;
 if length(btrim(p->>'title'))<1 or length(p->>'title')>160 or length(btrim(p->>'objective'))<1 or length(p->>'objective')>4000 or length(btrim(p->>'expectedBehavior'))<1 or length(p->>'expectedBehavior')>4000 or length(btrim(p->>'reason'))<1 or length(p->>'reason')>2000 or length(btrim(p->>'priorityReason'))<1 or length(p->>'priorityReason')>2000 or p->>'ruleId' !~ '^TEST_[A-Z0-9_]{1,70}$' or p->>'priority' not in ('ROUTINE','HIGH','URGENT') or p->>'testType' not in ('FUNCTIONAL','VALIDATION','AUTHENTICATION','AUTHORIZATION','CONTRACT','STATE','DEPENDENCY','ERROR_HANDLING','SECURITY') or jsonb_typeof(p->'executable') is distinct from 'boolean' then raise exception 'Planning limits' using errcode='23514';end if;
 if p->>'derivationType' is distinct from (case p->>'origin' when 'DETERMINISTIC' then 'DETERMINISTIC_INFERENCE' when 'AI_PROPOSED' then 'AI_INFERENCE' when 'HUMAN_AUTHORED' then case when manual_addition then 'HUMAN' else 'HUMAN_SOURCE' end end) or p->>'confidence' not in ('EXACT','STRONG','SUPPORTED') or p->>'confidence' is null or (p->>'origin'<>'DETERMINISTIC' and p->>'confidence'<>'SUPPORTED') then raise exception 'Invalid planning derivation' using errcode='23514';end if;
 if (manual_addition and p->>'origin'<>'HUMAN_AUTHORED') or (p->>'origin'<>'DETERMINISTIC' and p->'executable'<>'false'::jsonb) then raise exception 'Invalid planning origin' using errcode='23514';end if;
 foreach key in array array['requirementRefs','riskRefs','nodeRefs','edgeRefs','sourcePointers'] loop
  if jsonb_typeof(p->key) is distinct from 'array' or jsonb_array_length(p->key)>30 or exists(select 1 from jsonb_array_elements(p->key) v where jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 2000) then raise exception 'Planning reference bounds' using errcode='23514';end if;
 end loop;
 if jsonb_array_length(p->'requirementRefs')<1 or jsonb_array_length(p->'nodeRefs')<1 or jsonb_array_length(p->'sourcePointers')<1 then raise exception 'Planning traceability required' using errcode='23514';end if;
 if jsonb_typeof(p->'preconditions') is distinct from 'array' or jsonb_array_length(p->'preconditions')>10 or jsonb_typeof(p->'input') is distinct from 'object' or not ((p->'input') ?& array['strategy','pointer','value']) or (p->'input')-array['strategy','pointer','value']<>'{}'::jsonb or jsonb_typeof(p->'input'->'strategy') is distinct from 'string' or length(p->'input'->>'strategy') not between 1 and 80 then raise exception 'Invalid symbolic input' using errcode='23514';end if;
 for ref in select value from jsonb_array_elements(p->'preconditions') loop if jsonb_typeof(ref)<>'object' or not (ref ?& array['kind','reference']) or ref-array['kind','reference']<>'{}'::jsonb or ref->>'kind' not in ('AUTH_REQUIRED','IDENTIFIER_FROM_OPERATION','APPROVED_TEST_DATA') or ref->>'kind' is null or not(ref->'reference'='null'::jsonb or jsonb_typeof(ref->'reference')='string' and length(ref->>'reference') between 1 and 2000) then raise exception 'Invalid precondition' using errcode='23514';end if;end loop;
 if not(p->'input'->'pointer'='null'::jsonb or jsonb_typeof(p->'input'->'pointer')='string' and length(p->'input'->>'pointer') between 1 and 2000) or jsonb_typeof(p->'input'->'value') not in ('null','number','boolean','string') or length(p->'input'->>'value')>200 then raise exception 'Invalid input value' using errcode='23514';end if;
 if p->>'kind'='CASE' then
  if p->>'caseType' not in ('VALID','MISSING_REQUIRED','INVALID_TYPE','VALID_FORMAT','INVALID_FORMAT','ENUM_VALID','ENUM_INVALID','BOUNDARY_MIN','BOUNDARY_MAX','BELOW_MIN','ABOVE_MAX','UNAUTHORIZED','DECLARED_ERROR_RESPONSE','DEPENDENCY_SETUP','STATE_VALUE','INVESTIGATION','CUSTOM') or p->>'caseType' is null then raise exception 'Invalid case type' using errcode='23514';end if;
  select id into parent from public.test_items where plan_id=a.id and logical_key=p->>'scenarioKey' and kind='SCENARIO';if parent is null then raise exception 'Scenario unavailable' using errcode='23514';end if;
 elsif p->'caseType' is distinct from 'null'::jsonb or p->'scenarioKey' is distinct from 'null'::jsonb then raise exception 'Scenario must not have parent' using errcode='23514';end if;
 for ref in select value from jsonb_array_elements(p->'requirementRefs') loop
  select * into version from public.test_requirement_versions where plan_id=a.id and requirement_id=(ref#>>'{}')::uuid and status<>'REJECTED';if not found then raise exception 'Requirement unavailable' using errcode='23514';end if;
  -- Only immutable plan-local provenance governs historical planning.
  source_ai:=source_ai and version.source_kind='AI_PROPOSED';
  if not manual_addition and ((p->>'origin'='DETERMINISTIC' and version.source_kind not in ('SPEC_EXPLICIT','GRAPH_DERIVED')) or (p->>'origin'='HUMAN_AUTHORED' and version.source_kind<>'HUMAN_AUTHORED')) then raise exception 'Requirement source incompatible with planning origin' using errcode='23514';end if;
  if p->'executable'='true'::jsonb and (p->>'kind'<>'CASE' or version.status<>'APPROVED' or version.source_kind not in ('SPEC_EXPLICIT','GRAPH_DERIVED') or version.has_edits) then raise exception 'Requirement cannot support executable planning' using errcode='23514';end if;
  if parent is not null then perform 1 from public.test_item_qa_links where item_id=parent and qa_item_id=(ref#>>'{}')::uuid and qa_kind='REQUIREMENT';if not found then raise exception 'Case requirement disconnected from scenario' using errcode='23514';end if;end if;
 end loop;
 if p->>'origin'='AI_PROPOSED' and not source_ai and a.ai_status<>'SUCCEEDED' then raise exception 'AI proposal requires metadata' using errcode='23514';end if;
 select source_document into strict doc from public.api_imports where id=a.api_import_id;
 if p->'input'->'pointer'<>'null'::jsonb and not public.qa_pointer_exists(doc,p->'input'->>'pointer') then raise exception 'Unknown symbolic input pointer' using errcode='23514';end if;
 for ref in select value from jsonb_array_elements(p->'sourcePointers') loop if not public.qa_pointer_exists(doc,ref#>>'{}') then raise exception 'Unknown planning source pointer' using errcode='23514';end if;end loop;
 -- Identifier provenance must be an included dependency edge with operation endpoints in this exact graph.
 for ref in select value from jsonb_array_elements(p->'preconditions') where value->>'kind'='IDENTIFIER_FROM_OPERATION' loop
  if jsonb_typeof(ref->'reference') is distinct from 'string' or not ((p->'edgeRefs') ? (ref->>'reference')) or not exists(
   select 1 from public.behaviour_graph_edges e
   join public.behaviour_graph_nodes producer on producer.graph_id=e.graph_id and producer.logical_id=e.from_id
   join public.behaviour_graph_nodes consumer on consumer.graph_id=e.graph_id and consumer.logical_id=e.to_id
   where e.graph_id=a.behaviour_graph_id and e.logical_id=ref->>'reference' and e.type='OPERATION_PRECEDES_OPERATION'
    and e.api_import_id=a.api_import_id and e.project_id=a.project_id and e.workspace_id=a.workspace_id
    and producer.type='OPERATION' and consumer.type='OPERATION'
    and producer.api_import_id=a.api_import_id and producer.project_id=a.project_id and producer.workspace_id=a.workspace_id
    and consumer.api_import_id=a.api_import_id and consumer.project_id=a.project_id and consumer.workspace_id=a.workspace_id
    and (p->'nodeRefs') ? producer.logical_id and (p->'nodeRefs') ? consumer.logical_id
  ) then raise exception 'Invalid identifier dependency provenance' using errcode='23514';end if;
 end loop;
 insert into public.test_items(plan_id,qa_analysis_id,workspace_id,kind,logical_key,scenario_id,definition,origin,created_by) values(a.id,a.qa_analysis_id,a.workspace_id,p->>'kind',p->>'logicalKey',parent,p,p->>'origin',caller) returning id into result;
 for ref in select value from jsonb_array_elements(p->'requirementRefs') loop insert into public.test_item_qa_links values(result,a.id,a.qa_analysis_id,a.workspace_id,(ref#>>'{}')::uuid,'REQUIREMENT');end loop;
 for ref in select value from jsonb_array_elements(p->'riskRefs') loop insert into public.test_item_qa_links values(result,a.id,a.qa_analysis_id,a.workspace_id,(ref#>>'{}')::uuid,'RISK');end loop;
 for ref in select value from jsonb_array_elements(p->'nodeRefs') loop insert into public.test_item_nodes values(result,a.id,a.qa_analysis_id,a.workspace_id,a.behaviour_graph_id,a.api_import_id,a.project_id,ref#>>'{}');end loop;
 for ref in select value from jsonb_array_elements(p->'edgeRefs') loop insert into public.test_item_edges values(result,a.id,a.qa_analysis_id,a.workspace_id,a.behaviour_graph_id,a.api_import_id,a.project_id,ref#>>'{}');end loop;
 return result;
end;$$;
revoke all on function public.test_insert_item(uuid,jsonb,uuid,boolean) from public,anon,authenticated;
create function public.create_test_plan(target_analysis uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();a public.qa_analyses%rowtype;result uuid;r jsonb;i public.qa_items%rowtype;latest public.qa_reviews%rowtype;state text;title_current text;statement_current text;v jsonb;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into a from public.qa_analyses where id=target_analysis for share;if not found then raise exception 'Resource unavailable' using errcode='42501';end if;
 perform 1 from public.workspace_members where workspace_id=a.workspace_id and user_id=caller for share;if not found then raise exception 'Resource unavailable' using errcode='42501';end if;
 if payload is null or octet_length(payload::text)>4194304 or payload-array['workspaceId','projectId','importId','graphId','analysisId','engineVersion','status','aiStatus','aiMetadata','aiFailure','requirements','items']<>'{}'::jsonb or payload->>'workspaceId' is distinct from a.workspace_id::text or payload->>'projectId' is distinct from a.project_id::text or payload->>'importId' is distinct from a.api_import_id::text or payload->>'graphId' is distinct from a.behaviour_graph_id::text or payload->>'analysisId' is distinct from a.id::text or payload->>'status' is distinct from 'DRAFT' or jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_typeof(payload->'requirements') is distinct from 'array' then raise exception 'Invalid pinned plan' using errcode='23514';end if;
 if jsonb_array_length(payload->'items')>2000 or jsonb_array_length(payload->'requirements')>1000 or (select count(*) from jsonb_array_elements(payload->'items') x where x->>'kind'='SCENARIO')>500 or (select count(*) from jsonb_array_elements(payload->'items') x where x->>'origin'='AI_PROPOSED')>30 then raise exception 'Plan item bounds' using errcode='23514';end if;
 if payload->>'aiStatus'='SUCCEEDED' then
  v:=payload->'aiMetadata';if jsonb_typeof(v) is distinct from 'object' or v-array['provider','model','promptVersion']<>'{}'::jsonb or exists(select 1 from unnest(array['provider','model','promptVersion']) k where jsonb_typeof(v->k) is distinct from 'string' or length(v->>k) not between 1 and 200) then raise exception 'Invalid planning AI metadata' using errcode='23514';end if;
 elsif payload->'aiMetadata' is distinct from 'null'::jsonb then raise exception 'Unexpected planning AI metadata' using errcode='23514';end if;
 insert into public.test_plans(workspace_id,project_id,api_import_id,behaviour_graph_id,qa_analysis_id,engine_version,ai_status,ai_metadata,ai_failure,created_by) values(a.workspace_id,a.project_id,a.api_import_id,a.behaviour_graph_id,a.id,payload->>'engineVersion',payload->>'aiStatus',nullif(payload->'aiMetadata','null'::jsonb),payload->>'aiFailure',caller) returning id into result;
 -- Lock requirement rows in deterministic order; review RPC takes the same row lock.
 perform id from public.qa_items where analysis_id=a.id and kind='REQUIREMENT' order by id for share;
 for r in select value from jsonb_array_elements(payload->'requirements') loop
  select * into i from public.qa_items where id=(r->>'id')::uuid and analysis_id=a.id and kind='REQUIREMENT';if not found then raise exception 'Requirement unavailable' using errcode='23514';end if;
  select * into latest from public.qa_reviews where item_id=i.id order by revision desc limit 1;
  if latest.id is distinct from (r->>'reviewId')::uuid then raise exception 'Requirement review changed; regenerate' using errcode='40001';end if;
  state:=case when latest.decision='APPROVE' then 'APPROVED' when latest.decision='REJECT' then 'REJECTED' else 'PROPOSED' end;
  select coalesce(title,i.title),coalesce(statement,i.statement) into title_current,statement_current from public.qa_reviews where item_id=i.id and decision='EDIT' order by revision desc limit 1;
  title_current:=coalesce(title_current,i.title);statement_current:=coalesce(statement_current,i.statement);
  if r->>'status' is distinct from state or r->>'title' is distinct from title_current or r->>'statement' is distinct from statement_current then raise exception 'Forged requirement version' using errcode='23514';end if;
  insert into public.test_requirement_versions values(result,a.id,a.workspace_id,i.id,'REQUIREMENT',latest.id,state,title_current,statement_current,i.source_kind,exists(select 1 from public.qa_reviews where item_id=i.id and decision='EDIT' and revision<=latest.revision));
 end loop;
 if (select count(*) from public.test_requirement_versions where plan_id=result)<>(select count(*) from public.qa_items where analysis_id=a.id and kind='REQUIREMENT') then raise exception 'Incomplete requirement snapshot' using errcode='23514';end if;
 for r in select value from jsonb_array_elements(payload->'items') order by case when value->>'kind'='SCENARIO' then 0 else 1 end,value->>'logicalKey' loop perform public.test_insert_item(result,r,caller,false);end loop;
 insert into public.test_audit_events(plan_id,qa_analysis_id,workspace_id,actor_id,event) values(result,a.id,a.workspace_id,caller,'PLAN_CREATED');return result;
end;$$;
revoke all on function public.create_test_plan(uuid,jsonb) from public,anon;grant execute on function public.create_test_plan(uuid,jsonb) to authenticated;
create function public.review_test_item(target_item uuid,expected_review uuid,decision_input text,rationale_input text,title_input text,objective_input text,expected_input text) returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();i public.test_items%rowtype;member_role text;latest uuid;rev integer;result uuid;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into i from public.test_items where id=target_item for update;if not found then raise exception 'Resource unavailable' using errcode='42501';end if;
 select role into member_role from public.workspace_members where workspace_id=i.workspace_id and user_id=caller for share;
 if not found or (decision_input in ('APPROVE','REJECT') and member_role not in ('OWNER','ADMIN')) then raise exception 'Review permission required' using errcode='42501';end if;
 if coalesce(length(title_input),0)>160 or coalesce(length(objective_input),0)>4000 or coalesce(length(expected_input),0)>4000 or coalesce(length(rationale_input),0)>2000 or coalesce(octet_length(decision_input),0)::bigint+coalesce(octet_length(title_input),0)+coalesce(octet_length(objective_input),0)+coalesce(octet_length(expected_input),0)+coalesce(octet_length(rationale_input),0)>65536 then raise exception 'Review bounds' using errcode='23514';end if;
 select id,revision into latest,rev from public.test_reviews where item_id=i.id order by revision desc limit 1;if latest is distinct from expected_review then raise exception 'Review changed; reload' using errcode='40001';end if;
 insert into public.test_reviews(item_id,plan_id,qa_analysis_id,workspace_id,revision,actor_id,decision,rationale,title,objective,expected_behavior) values(i.id,i.plan_id,i.qa_analysis_id,i.workspace_id,coalesce(rev,0)+1,caller,decision_input,coalesce(rationale_input,''),btrim(title_input),btrim(objective_input),btrim(expected_input)) returning id into result;
 insert into public.test_audit_events(plan_id,qa_analysis_id,workspace_id,item_id,actor_id,event) values(i.plan_id,i.qa_analysis_id,i.workspace_id,i.id,caller,i.kind||'_'||decision_input);return result;
end;$$;
revoke all on function public.review_test_item(uuid,uuid,text,text,text,text,text) from public,anon;grant execute on function public.review_test_item(uuid,uuid,text,text,text,text,text) to authenticated;
create function public.add_human_test_item(target_plan uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();a public.test_plans%rowtype;result uuid;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into a from public.test_plans where id=target_plan for update;if not found then raise exception 'Resource unavailable' using errcode='42501';end if;
 perform 1 from public.workspace_members where workspace_id=a.workspace_id and user_id=caller for share;if not found then raise exception 'Resource unavailable' using errcode='42501';end if;
 if (select count(*) from public.test_items where plan_id=a.id)>=2000 or (payload->>'kind'='SCENARIO' and (select count(*) from public.test_items where plan_id=a.id and kind='SCENARIO')>=500) then raise exception 'Planning item limit' using errcode='23514';end if;
 result:=public.test_insert_item(a.id,payload,caller,true);
 insert into public.test_audit_events(plan_id,qa_analysis_id,workspace_id,item_id,actor_id,event) values(a.id,a.qa_analysis_id,a.workspace_id,result,caller,'HUMAN_'||(payload->>'kind')||'_ADDED');return result;
end;$$;
revoke all on function public.add_human_test_item(uuid,jsonb) from public,anon;grant execute on function public.add_human_test_item(uuid,jsonb) to authenticated;
commit;
