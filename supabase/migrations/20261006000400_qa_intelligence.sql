begin;
create table public.qa_analyses (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null, api_import_id uuid not null, behaviour_graph_id uuid not null,
 generated_item_count integer not null check(generated_item_count between 0 and 1000),
 engine_version text not null check(engine_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$' and length(engine_version)<=80),
 ai_status text not null check(ai_status in ('NOT_CONFIGURED','SUCCEEDED','FAILED')), ai_metadata jsonb, ai_failure text check(ai_failure is null or length(ai_failure)<=500),
 created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
 unique(id,behaviour_graph_id,api_import_id,project_id,workspace_id),
 unique(id,workspace_id),
 check((ai_status='SUCCEEDED' and ai_metadata is not null and jsonb_typeof(ai_metadata)='object' and ai_metadata->'validated' is not distinct from 'true'::jsonb) or (ai_status<>'SUCCEEDED' and ai_metadata is null)),
 foreign key(behaviour_graph_id,api_import_id,project_id,workspace_id) references public.behaviour_graphs(id,api_import_id,project_id,workspace_id)
);
create table public.qa_items (
 id uuid primary key default gen_random_uuid(), analysis_id uuid not null, behaviour_graph_id uuid not null, api_import_id uuid not null, project_id uuid not null,workspace_id uuid not null,
 logical_key text not null check(octet_length(logical_key) between 1 and 2000),kind text not null check(kind in ('REQUIREMENT','RISK')),
 title text not null check(length(btrim(title)) between 1 and 160),statement text not null check(length(btrim(statement)) between 1 and 4000),category text not null,
 source_kind text not null check(source_kind in ('SPEC_EXPLICIT','GRAPH_DERIVED','AI_PROPOSED','HUMAN_AUTHORED')),
 derivation_type text not null,confidence text not null check(confidence in ('EXACT','STRONG','SUPPORTED')),
 rule_id text not null check(rule_id ~ '^[A-Z][A-Z0-9_]{0,79}$'),reason text not null check(length(btrim(reason)) between 1 and 2000),source_pointers jsonb not null check(jsonb_typeof(source_pointers)='array' and jsonb_array_length(source_pointers) between 1 and 30),
 node_count integer not null check(node_count between 1 and 30),edge_count integer not null check(edge_count between 0 and 30),requirement_count integer not null check(requirement_count between 0 and 30),
 severity text,priority text,created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 check((source_kind='SPEC_EXPLICIT' and derivation_type='EXPLICIT') or (source_kind='GRAPH_DERIVED' and derivation_type='DETERMINISTIC_INFERENCE') or (source_kind='AI_PROPOSED' and derivation_type='AI_INFERENCE' and confidence<>'EXACT') or (source_kind='HUMAN_AUTHORED' and derivation_type='HUMAN')),
 check((kind='REQUIREMENT' and severity is null and priority is null and category in ('FUNCTIONAL','VALIDATION','SECURITY','AUTHORIZATION','DATA_CONTRACT','ERROR_HANDLING','STATE','DEPENDENCY','IDEMPOTENCY','PAGINATION','FILTERING','SORTING','RATE_LIMITING','CONCURRENCY','PERFORMANCE','OBSERVABILITY')) or (kind='RISK' and severity is not null and priority is not null and severity in ('LOW','MEDIUM','HIGH','CRITICAL') and priority in ('ROUTINE','HIGH','URGENT') and category in ('AUTHENTICATION','AUTHORIZATION','INPUT_VALIDATION','DATA_INTEGRITY','STATE_MANAGEMENT','DEPENDENCY','DESTRUCTIVE_OPERATION','SENSITIVE_DATA','ERROR_HANDLING','CONCURRENCY','IDEMPOTENCY','RATE_LIMITING','PERFORMANCE','CONTRACT_COMPLEXITY','INTEGRATION'))),
 unique(analysis_id,logical_key),unique(id,analysis_id),unique(id,analysis_id,kind),unique(id,analysis_id,behaviour_graph_id,api_import_id,project_id,workspace_id),
 foreign key(analysis_id,behaviour_graph_id,api_import_id,project_id,workspace_id) references public.qa_analyses(id,behaviour_graph_id,api_import_id,project_id,workspace_id)
);
create table public.qa_item_nodes (
 item_id uuid not null,analysis_id uuid not null,behaviour_graph_id uuid not null,api_import_id uuid not null,project_id uuid not null,workspace_id uuid not null,node_id text not null,
 primary key(item_id,node_id),
 foreign key(item_id,analysis_id,behaviour_graph_id,api_import_id,project_id,workspace_id) references public.qa_items(id,analysis_id,behaviour_graph_id,api_import_id,project_id,workspace_id),
 foreign key(behaviour_graph_id,node_id,api_import_id,project_id,workspace_id) references public.behaviour_graph_nodes(graph_id,logical_id,api_import_id,project_id,workspace_id)
);
create table public.qa_item_edges (
 item_id uuid not null,analysis_id uuid not null,behaviour_graph_id uuid not null,api_import_id uuid not null,project_id uuid not null,workspace_id uuid not null,edge_id text not null,
 primary key(item_id,edge_id),
 foreign key(item_id,analysis_id,behaviour_graph_id,api_import_id,project_id,workspace_id) references public.qa_items(id,analysis_id,behaviour_graph_id,api_import_id,project_id,workspace_id),
 foreign key(behaviour_graph_id,edge_id) references public.behaviour_graph_edges(graph_id,logical_id)
);
create table public.qa_item_requirements (
 item_id uuid not null,requirement_id uuid not null,analysis_id uuid not null,workspace_id uuid not null,requirement_kind text not null default 'REQUIREMENT' check(requirement_kind='REQUIREMENT'),
 primary key(item_id,requirement_id),check(item_id<>requirement_id),
 foreign key(item_id,analysis_id) references public.qa_items(id,analysis_id),
 foreign key(requirement_id,analysis_id,requirement_kind) references public.qa_items(id,analysis_id,kind)
);
-- Candidate key for scoped review/audit and requirement-link FK.
alter table public.qa_items add constraint qa_items_review_scope unique(id,analysis_id,workspace_id);
alter table public.qa_item_requirements add constraint qa_requirement_link_scope foreign key(item_id,analysis_id,workspace_id) references public.qa_items(id,analysis_id,workspace_id);
create table public.qa_reviews (
 id uuid primary key default gen_random_uuid(),item_id uuid not null,analysis_id uuid not null,workspace_id uuid not null,
 revision integer not null check(revision>0),actor_id uuid not null references auth.users(id),created_at timestamptz not null default now(),decision text not null check(decision in ('APPROVE','REJECT','EDIT')),
 rationale text not null check(length(rationale)<=2000),title text,statement text,
 check((decision='EDIT' and title is not null and statement is not null and length(btrim(title)) between 1 and 160 and length(title)<=160 and title=btrim(title) and length(btrim(statement)) between 1 and 4000 and length(statement)<=4000 and statement=btrim(statement)) or (decision<>'EDIT' and title is null and statement is null)),
 unique(item_id,revision),foreign key(item_id,analysis_id,workspace_id) references public.qa_items(id,analysis_id,workspace_id)
);
create table public.qa_audit_events (
 id uuid primary key default gen_random_uuid(),analysis_id uuid not null references public.qa_analyses(id),workspace_id uuid not null references public.workspaces(id),item_id uuid,
 actor_id uuid not null references auth.users(id),event text not null check(event in ('ANALYSIS_CREATED','HUMAN_REQUIREMENT_ADDED','HUMAN_RISK_ADDED','REQUIREMENT_APPROVE','REQUIREMENT_REJECT','REQUIREMENT_EDIT','RISK_APPROVE','RISK_REJECT','RISK_EDIT')),created_at timestamptz not null default now(),
 foreign key(item_id,analysis_id,workspace_id) references public.qa_items(id,analysis_id,workspace_id),
 foreign key(analysis_id,workspace_id) references public.qa_analyses(id,workspace_id)
);
create index qa_analyses_project_history on public.qa_analyses(workspace_id,project_id,created_at desc,id desc);
create index qa_items_analysis_kind on public.qa_items(workspace_id,analysis_id,kind,logical_key);
create index qa_nodes_reverse on public.qa_item_nodes(workspace_id,behaviour_graph_id,node_id);
create index qa_edges_reverse on public.qa_item_edges(workspace_id,behaviour_graph_id,edge_id);
create index qa_requirements_reverse on public.qa_item_requirements(workspace_id,requirement_id);
create index qa_reviews_history on public.qa_reviews(workspace_id,item_id,revision);
create index qa_audit_history on public.qa_audit_events(workspace_id,analysis_id,created_at);
alter table public.qa_analyses enable row level security;alter table public.qa_items enable row level security;
alter table public.qa_item_nodes enable row level security;alter table public.qa_item_edges enable row level security;alter table public.qa_item_requirements enable row level security;
alter table public.qa_reviews enable row level security;alter table public.qa_audit_events enable row level security;
create policy qa_analysis_read on public.qa_analyses for select to authenticated using(public.is_workspace_member(workspace_id));
create policy qa_item_read on public.qa_items for select to authenticated using(public.is_workspace_member(workspace_id));
create policy qa_node_read on public.qa_item_nodes for select to authenticated using(public.is_workspace_member(workspace_id));
create policy qa_edge_read on public.qa_item_edges for select to authenticated using(public.is_workspace_member(workspace_id));
create policy qa_requirement_read on public.qa_item_requirements for select to authenticated using(public.is_workspace_member(workspace_id));
create policy qa_review_read on public.qa_reviews for select to authenticated using(public.is_workspace_member(workspace_id));
create policy qa_audit_read on public.qa_audit_events for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.qa_analyses,public.qa_items,public.qa_item_nodes,public.qa_item_edges,public.qa_item_requirements,public.qa_reviews,public.qa_audit_events from public,anon,authenticated;
grant select on public.qa_analyses,public.qa_items,public.qa_item_nodes,public.qa_item_edges,public.qa_item_requirements,public.qa_reviews,public.qa_audit_events to authenticated;

create function public.qa_pointer_exists(document jsonb,pointer text) returns boolean language plpgsql immutable set search_path='' as $$
declare parts text[]; part text; target jsonb:=document;
begin
 if pointer='#' then return true;end if;
 if pointer is null or pointer !~ '^#/' or pointer ~ '~([^01]|$)' or length(pointer)>2000 then return false;end if;
 parts:=string_to_array(substr(pointer,3),'/');
 foreach part in array parts loop
  part:=replace(replace(part,'~1','/'),'~0','~');
  if jsonb_typeof(target)='array' then if part !~ '^(0|[1-9][0-9]*)$' or length(part)>8 then return false;end if;target:=target->part::integer;
  else target:=target->part;end if;
  if target is null then return false;end if;
 end loop;
 return true;
end;$$;
revoke all on function public.qa_pointer_exists(jsonb,text) from public,anon,authenticated;

create function public.qa_insert_item(target_analysis uuid,p jsonb,caller uuid,allow_human boolean) returns uuid language plpgsql set search_path='' as $$
declare a public.qa_analyses%rowtype; item uuid; ref jsonb; doc jsonb;
begin
 select * into strict a from public.qa_analyses where id=target_analysis;
 if p is null or jsonb_typeof(p)<>'object' or p-array['logicalKey','kind','title','statement','category','sourceKind','derivationType','confidence','ruleId','reason','sourcePointers','nodeRefs','edgeRefs','requirementRefs','severity','priority']<>'{}'::jsonb then raise exception 'Invalid QA proposal' using errcode='23514';end if;
 if exists(select 1 from unnest(array['logicalKey','kind','title','statement','category','sourceKind','derivationType','confidence','ruleId','reason']) k where jsonb_typeof(p->k) is distinct from 'string') then raise exception 'Invalid QA text' using errcode='23514';end if;
 if (p->>'sourceKind'='HUMAN_AUTHORED') is distinct from allow_human or (p->>'sourceKind'='AI_PROPOSED' and a.ai_status<>'SUCCEEDED') then raise exception 'Invalid QA origin' using errcode='23514';end if;
 foreach doc in array array[p->'sourcePointers',p->'nodeRefs',p->'edgeRefs',p->'requirementRefs'] loop
  if doc is null or jsonb_typeof(doc)<>'array' then raise exception 'Invalid QA evidence' using errcode='23514';end if;
  if jsonb_array_length(doc)>30 then raise exception 'QA evidence limit' using errcode='23514';end if;
  if exists(select 1 from jsonb_array_elements(doc) v where jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 2000) then raise exception 'Invalid QA evidence' using errcode='23514';end if;
 end loop;
 if jsonb_array_length(p->'sourcePointers')<1 or jsonb_array_length(p->'nodeRefs')<1 then raise exception 'QA evidence required' using errcode='23514';end if;
 select source_document into strict doc from public.api_imports where id=a.api_import_id;
 for ref in select value from jsonb_array_elements(p->'sourcePointers') loop if not public.qa_pointer_exists(doc,ref#>>'{}') then raise exception 'Unknown source pointer' using errcode='23514';end if;end loop;
 insert into public.qa_items(analysis_id,behaviour_graph_id,api_import_id,project_id,workspace_id,logical_key,kind,title,statement,category,source_kind,derivation_type,confidence,rule_id,reason,source_pointers,node_count,edge_count,requirement_count,severity,priority,created_by)
 values(a.id,a.behaviour_graph_id,a.api_import_id,a.project_id,a.workspace_id,p->>'logicalKey',p->>'kind',p->>'title',p->>'statement',p->>'category',p->>'sourceKind',p->>'derivationType',p->>'confidence',p->>'ruleId',p->>'reason',p->'sourcePointers',jsonb_array_length(p->'nodeRefs'),jsonb_array_length(p->'edgeRefs'),jsonb_array_length(p->'requirementRefs'),p->>'severity',p->>'priority',caller) returning id into item;
 for ref in select value from jsonb_array_elements(p->'nodeRefs') loop insert into public.qa_item_nodes values(item,a.id,a.behaviour_graph_id,a.api_import_id,a.project_id,a.workspace_id,ref#>>'{}');end loop;
 for ref in select value from jsonb_array_elements(p->'edgeRefs') loop insert into public.qa_item_edges values(item,a.id,a.behaviour_graph_id,a.api_import_id,a.project_id,a.workspace_id,ref#>>'{}');end loop;
 return item;
end;$$;
revoke all on function public.qa_insert_item(uuid,jsonb,uuid,boolean) from public,anon,authenticated;

create function public.create_qa_analysis(target_workspace uuid,target_project uuid,target_import uuid,target_graph uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();analysis uuid;p jsonb;r jsonb;item uuid;req uuid;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform 1 from public.workspace_members where workspace_id=target_workspace and user_id=caller for key share;
 if not found then raise exception 'Resource unavailable' using errcode='42501';end if;
 perform 1 from public.behaviour_graphs where id=target_graph and api_import_id=target_import and project_id=target_project and workspace_id=target_workspace for key share;
 if not found then raise exception 'Resource unavailable' using errcode='42501';end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>4194304 or payload->>'workspaceId' is distinct from target_workspace::text or payload->>'projectId' is distinct from target_project::text or payload->>'importId' is distinct from target_import::text or payload->>'graphId' is distinct from target_graph::text or jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'Invalid analysis' using errcode='23514';end if;
 if payload-array['workspaceId','projectId','importId','graphId','engineVersion','aiStatus','aiMetadata','aiFailure','items']<>'{}'::jsonb then raise exception 'Unknown analysis field' using errcode='23514';end if;
 if payload->>'aiStatus'='SUCCEEDED' then
  if jsonb_typeof(payload->'aiMetadata') is distinct from 'object' or exists(select 1 from unnest(array['provider','model','promptVersion','analysisVersion','completedAt']) k where jsonb_typeof(payload->'aiMetadata'->k) is distinct from 'string' or length(payload->'aiMetadata'->>k) not between 1 and 200) or jsonb_typeof(payload->'aiMetadata'->'inputEvidence') is distinct from 'array' then raise exception 'Invalid AI metadata' using errcode='23514';end if;
  if jsonb_array_length(payload->'aiMetadata'->'inputEvidence')>500 or exists(select 1 from jsonb_array_elements(payload->'aiMetadata'->'inputEvidence') v where jsonb_typeof(v)<>'string' or v#>>'{}' !~ '^[ne][0-9]+$') then raise exception 'Invalid AI catalog' using errcode='23514';end if;
 end if;
 if (payload->>'aiStatus'='FAILED' and (jsonb_typeof(payload->'aiFailure') is distinct from 'string' or length(payload->>'aiFailure') not between 1 and 500)) or (payload->>'aiStatus'<>'FAILED' and payload->'aiFailure' is distinct from 'null'::jsonb) then raise exception 'Invalid AI failure state' using errcode='23514';end if;
 if jsonb_array_length(payload->'items')>1000 then raise exception 'Analysis item limit' using errcode='23514';end if;
 if (select count(*) from jsonb_array_elements(payload->'items') entry where entry->>'sourceKind'='AI_PROPOSED')>50 then raise exception 'AI item limit' using errcode='23514';end if;
 insert into public.qa_analyses(workspace_id,project_id,api_import_id,behaviour_graph_id,generated_item_count,engine_version,ai_status,ai_metadata,ai_failure,created_by)
 values(target_workspace,target_project,target_import,target_graph,jsonb_array_length(payload->'items'),payload->>'engineVersion',payload->>'aiStatus',nullif(payload->'aiMetadata','null'::jsonb),payload->>'aiFailure',caller) returning id into analysis;
 for p in select value from jsonb_array_elements(payload->'items') loop perform public.qa_insert_item(analysis,p,caller,false);end loop;
 for p in select value from jsonb_array_elements(payload->'items') loop
  select id into strict item from public.qa_items where analysis_id=analysis and logical_key=p->>'logicalKey';
  for r in select value from jsonb_array_elements(p->'requirementRefs') loop
   select id into req from public.qa_items where analysis_id=analysis and kind='REQUIREMENT' and logical_key=r#>>'{}';
   if req is null then raise exception 'Unknown requirement reference' using errcode='23514';end if;
   insert into public.qa_item_requirements(item_id,requirement_id,analysis_id,workspace_id) values(item,req,analysis,target_workspace);
  end loop;
 end loop;
 insert into public.qa_audit_events(analysis_id,workspace_id,actor_id,event) values(analysis,target_workspace,caller,'ANALYSIS_CREATED');
 return analysis;
end;$$;
revoke all on function public.create_qa_analysis(uuid,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_qa_analysis(uuid,uuid,uuid,uuid,jsonb) to authenticated;

create function public.review_qa_item(target_item uuid,expected_review uuid,decision_input text,rationale_input text,title_input text,statement_input text) returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();i public.qa_items%rowtype;member_role text;latest uuid;rev integer;result uuid;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into i from public.qa_items where id=target_item for update;
 if not found then raise exception 'Resource unavailable' using errcode='42501';end if;
 select role into member_role from public.workspace_members where workspace_id=i.workspace_id and user_id=caller for share;
 if not found or (decision_input in ('APPROVE','REJECT') and member_role not in ('OWNER','ADMIN')) then raise exception 'Review permission required' using errcode='42501';end if;
 -- Bound raw caller input before normalization; 32 KiB accommodates all field limits in UTF-8.
 if coalesce(length(title_input),0)>160 or coalesce(length(statement_input),0)>4000 or coalesce(length(rationale_input),0)>2000 or
    coalesce(octet_length(decision_input),0)::bigint+coalesce(octet_length(rationale_input),0)+coalesce(octet_length(title_input),0)+coalesce(octet_length(statement_input),0)>32768 then
  raise exception 'Review payload exceeds limits' using errcode='23514';
 end if;
 select id,revision into latest,rev from public.qa_reviews where item_id=i.id order by revision desc limit 1;
 if latest is distinct from expected_review then raise exception 'Review changed; reload before deciding' using errcode='40001';end if;
 insert into public.qa_reviews(item_id,analysis_id,workspace_id,revision,actor_id,decision,rationale,title,statement) values(i.id,i.analysis_id,i.workspace_id,coalesce(rev,0)+1,caller,decision_input,coalesce(rationale_input,''),btrim(title_input),btrim(statement_input)) returning id into result;
 insert into public.qa_audit_events(analysis_id,workspace_id,item_id,actor_id,event) values(i.analysis_id,i.workspace_id,i.id,caller,i.kind||'_'||decision_input);
 return result;
end;$$;
revoke all on function public.review_qa_item(uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.review_qa_item(uuid,uuid,text,text,text,text) to authenticated;

create function public.add_human_qa_item(target_analysis uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();a public.qa_analyses%rowtype;result uuid;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into a from public.qa_analyses where id=target_analysis for update;
 if not found then raise exception 'Resource unavailable' using errcode='42501';end if;
 perform 1 from public.workspace_members where workspace_id=a.workspace_id and user_id=caller for key share;
 if not found then raise exception 'Resource unavailable' using errcode='42501';end if;
 if payload is null or octet_length(payload::text)>65536 or (select count(*) from public.qa_items where analysis_id=a.id)>=1000 then raise exception 'Human proposal limit' using errcode='23514';end if;
 if payload->'requirementRefs' is distinct from '[]'::jsonb then raise exception 'Human proposal links must be empty' using errcode='23514';end if;
 result:=public.qa_insert_item(a.id,payload,caller,true);
 insert into public.qa_audit_events(analysis_id,workspace_id,item_id,actor_id,event) values(a.id,a.workspace_id,result,caller,'HUMAN_'||(payload->>'kind')||'_ADDED');
 return result;
end;$$;
revoke all on function public.add_human_qa_item(uuid,jsonb) from public,anon;
grant execute on function public.add_human_qa_item(uuid,jsonb) to authenticated;
commit;
