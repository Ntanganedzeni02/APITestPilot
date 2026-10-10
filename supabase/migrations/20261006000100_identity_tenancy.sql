-- Ordinary callers use authenticated JWTs, never service-role keys.
begin;
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER', 'ADMIN', 'MEMBER')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members(user_id, workspace_id);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index projects_workspace_idx on public.projects(workspace_id, created_at, id);
create table public.environments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  type text not null check (type in ('DEVELOPMENT', 'STAGING', 'PRODUCTION')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, type)
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid,
  actor_id uuid not null references auth.users(id),
  event text not null check (event in ('WORKSPACE_CREATED', 'PROJECT_CREATED')),
  created_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade,
  check ((event = 'WORKSPACE_CREATED' and project_id is null) or (event = 'PROJECT_CREATED' and project_id is not null))
);
create index audit_logs_workspace_idx on public.audit_logs(workspace_id, created_at);
-- Avoid recursive membership RLS; callers can only ask about their own access.
create function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.workspace_members m where m.workspace_id = target_workspace and m.user_id = auth.uid()
  );
$$;
revoke all on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.environments enable row level security;
alter table public.audit_logs enable row level security;
create policy workspace_read on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy membership_read on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy project_read on public.projects for select to authenticated using (public.is_workspace_member(workspace_id));
create policy environment_read on public.environments for select to authenticated using (
  exists (select 1 from public.projects p where p.id = project_id and public.is_workspace_member(p.workspace_id))
);
create policy audit_read on public.audit_logs for select to authenticated using (public.is_workspace_member(workspace_id));
-- Direct mutations are intentionally closed, including membership/role changes.
revoke all on public.workspaces, public.workspace_members, public.projects, public.environments, public.audit_logs from public, anon, authenticated;
grant select on public.workspaces, public.workspace_members, public.projects, public.environments, public.audit_logs to authenticated;
-- Bootstrap membership atomically without opening INSERT policies.
create function public.create_workspace(workspace_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); new_id uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.workspaces(name, created_by) values (btrim(workspace_name), caller) returning id into new_id;
  insert into public.workspace_members(workspace_id, user_id, role) values (new_id, caller, 'OWNER');
  insert into public.audit_logs(workspace_id, actor_id, event) values (new_id, caller, 'WORKSPACE_CREATED');
  return new_id;
end;
$$;
revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;
create function public.create_project(target_workspace uuid, project_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); new_id uuid;
begin
  if caller is null or not public.is_workspace_member(target_workspace) then
    raise exception 'Workspace access required' using errcode = '42501';
  end if;
  -- Keep membership valid throughout creation.
  perform 1 from public.workspace_members where workspace_id = target_workspace and user_id = caller for key share;
  if not found then raise exception 'Workspace access required' using errcode = '42501'; end if;
  insert into public.projects(workspace_id, name, created_by) values (target_workspace, btrim(project_name), caller) returning id into new_id;
  insert into public.environments(project_id, type) values (new_id, 'DEVELOPMENT'), (new_id, 'STAGING'), (new_id, 'PRODUCTION');
  insert into public.audit_logs(workspace_id, project_id, actor_id, event) values (target_workspace, new_id, caller, 'PROJECT_CREATED');
  return new_id;
end;
$$;
revoke all on function public.create_project(uuid, text) from public, anon;
grant execute on function public.create_project(uuid, text) to authenticated;
commit;
