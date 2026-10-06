begin;
-- Add scoped candidate keys without changing M1.2/M1.3 access controls.
alter table public.api_imports add constraint api_imports_graph_scope_key unique(id, project_id, workspace_id);
create table public.behaviour_graphs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null, project_id uuid not null, api_import_id uuid not null,
  model_version integer not null check(model_version = 1),
  builder_version text not null check(builder_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$' and length(builder_version) <= 80),
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  node_count integer not null check(node_count between 1 and 12000), edge_count integer not null check(edge_count between 0 and 30000),
  unique(id,api_import_id,project_id,workspace_id),
  foreign key(api_import_id,project_id,workspace_id) references public.api_imports(id,project_id,workspace_id)
);
create table public.behaviour_graph_nodes (
  graph_id uuid not null, api_import_id uuid not null, project_id uuid not null, workspace_id uuid not null,
  logical_id text not null check(octet_length(logical_id) between 1 and 2000),
  type text not null check(type in ('API','SERVER','OPERATION','RESOURCE','SCHEMA','PARAMETER','REQUEST_BODY','RESPONSE','SECURITY_SCHEME','TAG','IDENTIFIER','STATE','ACTOR')),
  label text not null check(length(label) between 1 and 4000), provenance jsonb not null,
  primary key(graph_id,logical_id),
  unique(graph_id,logical_id,api_import_id,project_id,workspace_id),
  foreign key(graph_id,api_import_id,project_id,workspace_id) references public.behaviour_graphs(id,api_import_id,project_id,workspace_id)
);
create table public.behaviour_graph_edges (
  graph_id uuid not null, api_import_id uuid not null, project_id uuid not null, workspace_id uuid not null,
  logical_id text not null check(octet_length(logical_id) between 1 and 2000),
  type text not null check(type in ('API_HAS_OPERATION','API_HAS_SERVER','OPERATION_HAS_SERVER','OPERATION_TAGGED_WITH','OPERATION_HAS_PARAMETER','OPERATION_ACCEPTS_REQUEST','OPERATION_RETURNS_RESPONSE','OPERATION_REQUIRES_SECURITY','REQUEST_USES_SCHEMA','RESPONSE_USES_SCHEMA','PARAMETER_USES_SCHEMA','SCHEMA_REFERENCES_SCHEMA','RESOURCE_USES_SCHEMA','OPERATION_READS_RESOURCE','OPERATION_CREATES_RESOURCE','OPERATION_UPDATES_RESOURCE','OPERATION_DELETES_RESOURCE','OPERATION_PRODUCES_IDENTIFIER','OPERATION_CONSUMES_IDENTIFIER','IDENTIFIER_BELONGS_TO_RESOURCE','OPERATION_PRECEDES_OPERATION','STATE_BELONGS_TO_RESOURCE','SECURITY_HAS_ACTOR')), from_id text not null, to_id text not null, provenance jsonb not null,
  primary key(graph_id,logical_id), unique(graph_id,type,from_id,to_id),
  check(from_id <> to_id or type = 'SCHEMA_REFERENCES_SCHEMA'),
  foreign key(graph_id,api_import_id,project_id,workspace_id) references public.behaviour_graphs(id,api_import_id,project_id,workspace_id),
  foreign key(graph_id,from_id,api_import_id,project_id,workspace_id) references public.behaviour_graph_nodes(graph_id,logical_id,api_import_id,project_id,workspace_id),
  foreign key(graph_id,to_id,api_import_id,project_id,workspace_id) references public.behaviour_graph_nodes(graph_id,logical_id,api_import_id,project_id,workspace_id)
);
create index behaviour_graphs_import_history_idx on public.behaviour_graphs(workspace_id,project_id,api_import_id,created_at desc,id desc);
create index behaviour_graph_nodes_scope_idx on public.behaviour_graph_nodes(workspace_id,project_id,api_import_id,graph_id);
create index behaviour_graph_edges_scope_idx on public.behaviour_graph_edges(workspace_id,project_id,api_import_id,graph_id);
create index behaviour_graph_edges_incoming_idx on public.behaviour_graph_edges(graph_id,to_id);
create index behaviour_graph_edges_outgoing_idx on public.behaviour_graph_edges(graph_id,from_id);
alter table public.behaviour_graphs enable row level security;
alter table public.behaviour_graph_nodes enable row level security;
alter table public.behaviour_graph_edges enable row level security;
create policy graph_read on public.behaviour_graphs for select to authenticated using(public.is_workspace_member(workspace_id));
create policy graph_node_read on public.behaviour_graph_nodes for select to authenticated using(public.is_workspace_member(workspace_id));
create policy graph_edge_read on public.behaviour_graph_edges for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.behaviour_graphs,public.behaviour_graph_nodes,public.behaviour_graph_edges from public,anon,authenticated;
grant select on public.behaviour_graphs,public.behaviour_graph_nodes,public.behaviour_graph_edges to authenticated;

-- Private validator used by checks and the writer. No data access or dynamic SQL.
create function public.graph_provenance_valid(p jsonb, import_id uuid) returns boolean
language plpgsql immutable set search_path = '' as $$
declare entry jsonb; list jsonb; prior text; current_text text;
begin
  if p is null or jsonb_typeof(p) <> 'object' or p->>'importId' is distinct from import_id::text
    or p->>'ruleId' is null or p->>'ruleId' not in ('DECLARED_STRUCTURE','SECURITY_REQUIREMENT','DECLARED_SCOPE','RESOURCE_PATH_SCHEMA','CRUD_CORROBORATED','IDENTIFIER_EXACT','IDENTIFIER_DEPENDENCY','STATUS_ENUM')
    or p->>'derivation' is null or p->>'derivation' not in ('EXPLICIT','DETERMINISTIC_INFERENCE')
    or p->>'confidence' is null or p->>'confidence' not in ('EXACT','STRONG','SUPPORTED')
    or (p->>'derivation' = 'EXPLICIT' and p->>'confidence' <> 'EXACT') then return false; end if;
  foreach current_text in array array['sourcePointers','evidence'] loop
    list := p->current_text;
    if list is null or jsonb_typeof(list)<>'array' then return false; end if;
    if jsonb_array_length(list) not between 1 and 100 then return false; end if;
    prior := null;
    for entry in select value from jsonb_array_elements(list) loop
      if jsonb_typeof(entry)<>'string' or length(entry#>>'{}') not between 1 and 4000 then return false; end if;
      if current_text='sourcePointers' and entry#>>'{}'<>'#' and (entry#>>'{}' !~ '^#/' or entry#>>'{}' ~ '~([^01]|$)') then return false; end if;
      if prior is not null and prior collate "C" >= (entry#>>'{}') collate "C" then return false; end if;
      prior := entry#>>'{}';
    end loop;
  end loop;
  return true;
end;
$$;
revoke all on function public.graph_provenance_valid(jsonb,uuid) from public,anon,authenticated;
alter table public.behaviour_graph_nodes add constraint graph_node_provenance check(public.graph_provenance_valid(provenance,api_import_id));
alter table public.behaviour_graph_edges add constraint graph_edge_provenance check(public.graph_provenance_valid(provenance,api_import_id));

create function public.build_behaviour_graph(target_workspace uuid,target_project uuid,target_import uuid,payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); snapshot uuid; n jsonb; e jsonb; pair text[]; source_type text; target_type text; prior text;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform 1 from public.workspace_members where workspace_id=target_workspace and user_id=caller for key share;
  if not found then raise exception 'Resource unavailable' using errcode='42501'; end if;
  perform 1 from public.api_imports where id=target_import and project_id=target_project and workspace_id=target_workspace for key share;
  if not found then raise exception 'Resource unavailable' using errcode='42501'; end if;
  if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>8388608
    or payload->>'workspaceId' is distinct from target_workspace::text or payload->>'projectId' is distinct from target_project::text
    or payload->>'importId' is distinct from target_import::text or payload->'modelVersion' is distinct from '1'::jsonb
    or jsonb_typeof(payload->'nodes') is distinct from 'array' or jsonb_typeof(payload->'edges') is distinct from 'array' then
    raise exception 'Invalid graph' using errcode='23514'; end if;
  if jsonb_array_length(payload->'nodes') not between 1 and 12000 or jsonb_array_length(payload->'edges')>30000 then raise exception 'Graph limits exceeded' using errcode='23514'; end if;
  insert into public.behaviour_graphs(workspace_id,project_id,api_import_id,model_version,builder_version,created_by,node_count,edge_count)
    values(target_workspace,target_project,target_import,1,payload->>'builderVersion',caller,jsonb_array_length(payload->'nodes'),jsonb_array_length(payload->'edges')) returning id into snapshot;
  prior := null;
  for n in select value from jsonb_array_elements(payload->'nodes') loop
    if jsonb_typeof(n)<>'object' or jsonb_typeof(n->'id') is distinct from 'string' or jsonb_typeof(n->'label') is distinct from 'string' or jsonb_typeof(n->'type') is distinct from 'string'
      or (prior is not null and prior collate "C" >= (n->>'id') collate "C") then raise exception 'Invalid graph node' using errcode='23514'; end if;
    if jsonb_typeof((n->>'id')::jsonb) <> 'array' or jsonb_array_length((n->>'id')::jsonb)<>2
      or (n->>'id')::jsonb->>0 is distinct from n->>'type' or jsonb_typeof((n->>'id')::jsonb->1)<>'string'
      or length((n->>'id')::jsonb->>1)=0 then raise exception 'Invalid logical node identity' using errcode='23514'; end if;
    if n->>'id' is distinct from '[' || to_jsonb(n->>'type')::text || ',' || ((n->>'id')::jsonb->1)::text || ']' then raise exception 'Noncanonical logical node identity' using errcode='23514'; end if;
    insert into public.behaviour_graph_nodes values(snapshot,target_import,target_project,target_workspace,n->>'id',n->>'type',n->>'label',n->'provenance');
    prior:=n->>'id';
  end loop;
  if (select count(*) from public.behaviour_graph_nodes where graph_id=snapshot and type='API')<>1 then raise exception 'Invalid API root' using errcode='23514'; end if;
  prior := null;
  for e in select value from jsonb_array_elements(payload->'edges') loop
    pair := case e->>'type'
      when 'API_HAS_OPERATION' then array['API','OPERATION'] when 'API_HAS_SERVER' then array['API','SERVER']
      when 'OPERATION_HAS_SERVER' then array['OPERATION','SERVER']
      when 'OPERATION_TAGGED_WITH' then array['OPERATION','TAG'] when 'OPERATION_HAS_PARAMETER' then array['OPERATION','PARAMETER']
      when 'OPERATION_ACCEPTS_REQUEST' then array['OPERATION','REQUEST_BODY'] when 'OPERATION_RETURNS_RESPONSE' then array['OPERATION','RESPONSE']
      when 'OPERATION_REQUIRES_SECURITY' then array['OPERATION','SECURITY_SCHEME'] when 'REQUEST_USES_SCHEMA' then array['REQUEST_BODY','SCHEMA']
      when 'RESPONSE_USES_SCHEMA' then array['RESPONSE','SCHEMA'] when 'PARAMETER_USES_SCHEMA' then array['PARAMETER','SCHEMA']
      when 'SCHEMA_REFERENCES_SCHEMA' then array['SCHEMA','SCHEMA'] when 'RESOURCE_USES_SCHEMA' then array['RESOURCE','SCHEMA']
      when 'OPERATION_READS_RESOURCE' then array['OPERATION','RESOURCE'] when 'OPERATION_CREATES_RESOURCE' then array['OPERATION','RESOURCE']
      when 'OPERATION_UPDATES_RESOURCE' then array['OPERATION','RESOURCE'] when 'OPERATION_DELETES_RESOURCE' then array['OPERATION','RESOURCE']
      when 'OPERATION_PRODUCES_IDENTIFIER' then array['OPERATION','IDENTIFIER'] when 'OPERATION_CONSUMES_IDENTIFIER' then array['OPERATION','IDENTIFIER']
      when 'IDENTIFIER_BELONGS_TO_RESOURCE' then array['IDENTIFIER','RESOURCE'] when 'OPERATION_PRECEDES_OPERATION' then array['OPERATION','OPERATION']
      when 'STATE_BELONGS_TO_RESOURCE' then array['STATE','RESOURCE'] when 'SECURITY_HAS_ACTOR' then array['SECURITY_SCHEME','ACTOR'] else null end;
    if pair is null or jsonb_typeof(e)<>'object' or jsonb_typeof(e->'id') is distinct from 'string'
      or jsonb_typeof(e->'from') is distinct from 'string' or jsonb_typeof(e->'to') is distinct from 'string'
      or (prior is not null and prior collate "C" >= (e->>'id') collate "C") then raise exception 'Invalid graph edge' using errcode='23514'; end if;
    select type into source_type from public.behaviour_graph_nodes where graph_id=snapshot and logical_id=e->>'from';
    select type into target_type from public.behaviour_graph_nodes where graph_id=snapshot and logical_id=e->>'to';
    if source_type is distinct from pair[1] or target_type is distinct from pair[2] then raise exception 'Invalid graph endpoints' using errcode='23514'; end if;
    if (e->>'id')::jsonb is distinct from jsonb_build_array(e->>'type',e->>'from',e->>'to') then raise exception 'Invalid logical edge identity' using errcode='23514'; end if;
    if e->>'id' is distinct from '[' || to_jsonb(e->>'type')::text || ',' || to_jsonb(e->>'from')::text || ',' || to_jsonb(e->>'to')::text || ']' then raise exception 'Noncanonical logical edge identity' using errcode='23514'; end if;
    insert into public.behaviour_graph_edges values(snapshot,target_import,target_project,target_workspace,e->>'id',e->>'type',e->>'from',e->>'to',e->'provenance');
    prior:=e->>'id';
  end loop;
  return snapshot;
end;
$$;
revoke all on function public.build_behaviour_graph(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.build_behaviour_graph(uuid,uuid,uuid,jsonb) to authenticated;
commit;
