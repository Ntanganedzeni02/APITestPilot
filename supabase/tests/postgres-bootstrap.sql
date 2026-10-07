-- ONLY for a disposable vanilla PostgreSQL database, never an existing Supabase DB.
-- Compatibility fixture for Supabase's roles/auth schema, not an auth server.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if exists (select 1 from pg_roles where rolname in ('anon', 'authenticated') and (rolsuper or rolbypassrls)) then
    raise exception 'Test roles must not bypass RLS';
  end if;
end;
$$;
-- Hosted Supabase default EXECUTE grants must be modeled for M1.7 ACL tests.
do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin;end if;end;$$;
alter default privileges in schema public grant execute on functions to service_role;
create schema auth;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
