-- Helper dei test: utenti, lookup per nome, asserzioni.
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

create schema t;
grant usage on schema t to authenticated;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'TEST FALLITO: %', msg; end if;
  raise notice 'ok  %', msg;
end $$;
create function t.uid(p_username text) returns uuid language sql stable security definer as
  $$ select id from public.profiles where username = p_username $$;
create function t.cid(p_code text) returns uuid language sql stable security definer as
  $$ select id from public.cases where code = p_code $$;
create function t.iid(p_name text) returns uuid language sql stable security definer as
  $$ select id from public.items where name = p_name $$;
create function t.lo() returns uuid language sql stable security definer as
  $$ select id from public.load_outs where status = 'open' $$;
create function t.as_user(p_username text) returns void language sql as
  $$ select set_config('test.uid', t.uid(p_username)::text, false) $$;
-- tenta un'istruzione e dice se è fallita
create function t.fails(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql; return false;
exception when others then return true;
end $$;
grant execute on all functions in schema t to authenticated;

insert into auth.users(email) values ('leonardo@checkcase.local'), ('matteo@checkcase.local'), ('diego@checkcase.local');
insert into public.profiles (id, username, display_name, role)
select id, split_part(email, '@', 1), initcap(split_part(email, '@', 1)),
       case split_part(email, '@', 1) when 'leonardo' then 'admin' else 'operator' end
from auth.users;
