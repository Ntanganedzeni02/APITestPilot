begin;
create table public.api_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  project_id uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  source_format text not null check (source_format in ('json', 'yaml')),
  source_filename text check (source_filename is null or (char_length(source_filename) between 1 and 180 and source_filename !~ '[[:cntrl:]/\\]')),
  source_bytes integer not null check (source_bytes between 1 and 2097152),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  source_document jsonb not null check (jsonb_typeof(source_document) = 'object'),
  knowledge jsonb not null check (
    jsonb_typeof(knowledge) = 'object' and
    knowledge ?& array['modelVersion','operations','components','title','version','openapiVersion'] and
    knowledge @> '{"modelVersion":1}'::jsonb and
    jsonb_typeof(knowledge->'operations') = 'array' and
    jsonb_typeof(knowledge->'components') = 'object' and
    jsonb_typeof(knowledge->'title') = 'string' and
    jsonb_typeof(knowledge->'version') = 'string' and
    coalesce(knowledge->>'openapiVersion', '') ~ '^3\.[01]\.[0-9]+$'
  ),
  constraint api_import_size check (octet_length(source_document::text) + octet_length(knowledge::text) <= 8388608),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id)
);
create index api_imports_project_history_idx on public.api_imports(workspace_id, project_id, created_at desc, id desc);
alter table public.api_imports enable row level security;
create policy api_import_read on public.api_imports for select to authenticated using (public.is_workspace_member(workspace_id));
revoke all on public.api_imports from public, anon, authenticated;
grant select on public.api_imports to authenticated;

-- One immutable row is the complete import transaction. Actor and tenancy are
-- derived/checked here independently of application authorization.
create function public.import_api_spec(
  target_workspace uuid, target_project uuid, input_format text,
  input_filename text, input_bytes integer, input_hash text,
  input_document jsonb, input_knowledge jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); new_id uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform 1 from public.workspace_members where workspace_id = target_workspace and user_id = caller for key share;
  if not found then raise exception 'Resource unavailable' using errcode = '42501'; end if;
  perform 1 from public.projects where id = target_project and workspace_id = target_workspace for key share;
  if not found then raise exception 'Resource unavailable' using errcode = '42501'; end if;
  insert into public.api_imports(workspace_id, project_id, created_by, source_format, source_filename, source_bytes, source_hash, source_document, knowledge)
  values (target_workspace, target_project, caller, input_format, input_filename, input_bytes, input_hash, input_document, input_knowledge)
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.import_api_spec(uuid, uuid, text, text, integer, text, jsonb, jsonb) from public, anon;
grant execute on function public.import_api_spec(uuid, uuid, text, text, integer, text, jsonb, jsonb) to authenticated;
commit;
