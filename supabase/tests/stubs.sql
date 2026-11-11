-- Simula le parti di Supabase che le migration usano (auth, storage, realtime, ruoli).
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text unique);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create schema storage;
create table storage.buckets(id text primary key, name text, public bool);
create table storage.objects(id serial, bucket_id text);
alter table storage.objects enable row level security;
create publication supabase_realtime;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
-- Come su Supabase: le tabelle/funzioni create dopo ricevono i permessi per gli utenti loggati (poi decide la RLS).
grant usage on schema public to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
