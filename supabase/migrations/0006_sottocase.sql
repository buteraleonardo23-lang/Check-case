-- ═══════════════════════════════════════════════════════════════
-- 0006 · Sottocase (scatole dentro i case)
-- Un oggetto può essere un "sottocase" (is_container): ha la sua lista di oggetti (parent_item_id),
-- si riempie e si chiude come un case piccolo, e SOLO quando è chiuso si può mettere nel case grande.
-- Un solo livello: niente scatola dentro scatola. Solo admin decide cosa è un sottocase e cosa contiene.
-- Solo AGGIUNTE: i dati esistenti non cambiano (tutti gli oggetti restano normali e nel loro case). Rilanciabile.
-- ═══════════════════════════════════════════════════════════════

alter table public.items add column if not exists is_container boolean not null default false;
alter table public.items add column if not exists parent_item_id uuid references public.items(id) on delete set null;
alter table public.items add column if not exists layout_photos text[] not null default '{}';   -- foto "come è dentro" della scatola
create index if not exists items_parent_idx on public.items(parent_item_id);

alter table public.placements add column if not exists container_item_id uuid references public.items(id) on delete set null;

-- Chiusure delle scatole (come case_closures)
create table if not exists public.container_closures (
  id uuid primary key default gen_random_uuid(),
  load_out_id uuid not null references public.load_outs(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  closed_by uuid not null references public.profiles(id),
  closed_at timestamptz not null default now(),
  reopened_at timestamptz,
  reopened_by uuid references public.profiles(id),
  forced boolean not null default false,
  note text
);
create unique index if not exists container_closures_one_active
  on public.container_closures(load_out_id, item_id) where reopened_at is null;
alter table public.container_closures enable row level security;
drop policy if exists read_container_closures on public.container_closures;
create policy read_container_closures on public.container_closures for select using (is_member());

-- ───────────────────────── Regole sul catalogo ─────────────────────────
-- Un oggetto dentro una scatola va nello stesso case della scatola; un solo livello.
create or replace function public.trg_items_container_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_parent items%rowtype;
begin
  if new.parent_item_id is not null then
    if new.parent_item_id = new.id then raise exception 'Un oggetto non può stare dentro se stesso'; end if;
    select * into v_parent from items where id = new.parent_item_id;
    if not found or not v_parent.is_container then raise exception '«%» non è un sottocase', coalesce(v_parent.name, '?'); end if;
    if v_parent.parent_item_id is not null then raise exception 'Un sottocase non può stare dentro un altro sottocase'; end if;
    if new.is_container then raise exception 'Un sottocase non può stare dentro un altro sottocase'; end if;
    new.expected_case_id := v_parent.expected_case_id;
  end if;
  if tg_op = 'UPDATE' and old.is_container and not new.is_container
     and exists (select 1 from items c where c.parent_item_id = new.id and c.active) then
    raise exception 'Togli prima gli oggetti che ci sono dentro';
  end if;
  if new.is_container and new.parent_item_id is not null then
    raise exception 'Un sottocase non può stare dentro un altro sottocase';
  end if;
  return new;
end $$;
drop trigger if exists items_container_rules on public.items;
create trigger items_container_rules before insert or update on public.items
for each row execute function public.trg_items_container_rules();

-- Se la scatola cambia case, il suo contenuto la segue.
create or replace function public.trg_items_follow_container()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_container and new.expected_case_id is distinct from old.expected_case_id then
    update items set expected_case_id = new.expected_case_id where parent_item_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists items_follow_container on public.items;
create trigger items_follow_container after update on public.items
for each row execute function public.trg_items_follow_container();

-- Spostare in un altro case un oggetto che sta in una scatola lo tira fuori dalla scatola.
create or replace function public.move_item(
  p_item uuid, p_to_case uuid, p_pending boolean, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_from uuid;
begin
  if not is_admin() then raise exception 'solo admin'; end if;
  select expected_case_id into v_from from items where id = p_item for update;
  if v_from is not distinct from p_to_case and not exists (select 1 from items where id = p_item and parent_item_id is not null) then return; end if;
  update item_moves set status = 'done', completed_at = now(), completed_by = auth.uid()
  where item_id = p_item and status = 'pending';
  insert into item_moves(item_id, from_case_id, to_case_id, status, note, created_by, completed_at, completed_by)
  values (p_item, v_from, p_to_case, case when p_pending then 'pending' else 'done' end, p_note, auth.uid(),
          case when p_pending then null else now() end, case when p_pending then null else auth.uid() end);
  update items set parent_item_id = null, expected_case_id = p_to_case where id = p_item;
end $$;

-- Nel cestino non va una scatola che contiene ancora oggetti.
create or replace function public.trash_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo un admin può eliminare oggetti'; end if;
  if exists (select 1 from items where parent_item_id = p_item and active) then
    raise exception 'Questo sottocase contiene ancora oggetti: toglili prima';
  end if;
  update items set active = false, deleted_at = now(), deleted_by = auth.uid() where id = p_item and active;
  if not found then raise exception 'Oggetto non trovato o già nel cestino'; end if;
  perform log_event('item_trashed', auth.uid(),
    'ha spostato nel cestino ' || item_label(p_item) || ' (era nel ' || case_label((select expected_case_id from items where id = p_item)) || ')',
    null, p_item, null);
end $$;

-- ───────────────────────── Stato degli oggetti (con le scatole) ─────────────────────────
-- Oggetto in una scatola: verde solo se è nella SUA scatola. Oggetto normale: verde se è nel suo case.
-- (le colonne nuove sono in fondo: così la vista si aggiorna senza toccare chi la usa)
create or replace view public.load_out_item_status
with (security_invoker = true) as
select
  lo.id                as load_out_id,
  i.id                 as item_id,
  i.name               as item_name,
  i.aliases,
  i.expected_case_id,
  p.case_id            as actual_case_id,
  p.placed_by,
  pr.display_name      as placed_by_name,
  p.placed_at,
  case
    when p.id is null then 'red'
    when i.parent_item_id is not null and p.container_item_id is not distinct from i.parent_item_id then 'green'
    when i.parent_item_id is null and p.case_id = i.expected_case_id then 'green'
    else 'orange'
  end                  as status,
  i.parent_item_id,
  i.is_container,
  p.container_item_id  as actual_container_id
from public.load_outs lo
cross join public.items i
left join public.placements p
  on p.load_out_id = lo.id and p.item_id = i.id and p.removed_at is null
left join public.profiles pr on pr.id = p.placed_by
where i.active;

-- ───────────────────────── Mettere / togliere ─────────────────────────
drop function if exists public.place_item(uuid, uuid, uuid, boolean);
create or replace function public.place_item(
  p_load_out uuid, p_item uuid, p_case uuid, p_move boolean default false, p_container uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur record;
  v_case uuid := p_case;
  v_missing jsonb;
begin
  if not is_member() then raise exception 'non autorizzato'; end if;
  if not exists (select 1 from load_outs where id = p_load_out and status = 'open') then
    raise exception 'smontaggio non aperto';
  end if;

  if p_container is not null then
    if not exists (select 1 from items where id = p_container and is_container and active) then
      raise exception 'Non è un sottocase';
    end if;
    if p_container = p_item then raise exception 'Un oggetto non può stare dentro se stesso'; end if;
    if exists (select 1 from items where id = p_item and is_container) then
      return jsonb_build_object('result', 'nested_container');
    end if;
    v_case := (select expected_case_id from items where id = p_container);
    if exists (select 1 from container_closures where load_out_id = p_load_out and item_id = p_container and reopened_at is null) then
      return jsonb_build_object('result', 'container_closed');
    end if;
  end if;

  if exists (select 1 from case_closures where load_out_id = p_load_out
             and case_id = v_case and reopened_at is null) then
    return jsonb_build_object('result', 'case_closed');
  end if;

  -- una scatola si mette nel case grande solo se è stata riempita e chiusa
  if exists (select 1 from items where id = p_item and is_container)
     and not exists (select 1 from container_closures where load_out_id = p_load_out and item_id = p_item and reopened_at is null) then
    select coalesce(jsonb_agg(jsonb_build_object('item_id', s.item_id, 'name', s.item_name) order by s.item_name), '[]') into v_missing
    from load_out_item_status s where s.load_out_id = p_load_out and s.parent_item_id = p_item and s.status = 'red';
    return jsonb_build_object('result', 'container_open', 'missing', v_missing);
  end if;

  select p.*, c.code as case_code, pr.display_name as by_name, ci.name as container_name into cur
  from placements p
  join cases c on c.id = p.case_id
  join profiles pr on pr.id = p.placed_by
  left join items ci on ci.id = p.container_item_id
  where p.load_out_id = p_load_out and p.item_id = p_item and p.removed_at is null
  for update of p;

  if found then
    if cur.case_id = v_case and cur.container_item_id is not distinct from p_container then
      return jsonb_build_object('result', 'already_here');
    end if;
    if not p_move then
      return jsonb_build_object('result', 'conflict',
        'case_code', cur.case_code, 'container', cur.container_name, 'by', cur.by_name, 'at', cur.placed_at);
    end if;
    if cur.container_item_id is not null and exists (select 1 from container_closures where load_out_id = p_load_out
         and item_id = cur.container_item_id and reopened_at is null) then
      return jsonb_build_object('result', 'container_closed');
    end if;
    if exists (select 1 from case_closures where load_out_id = p_load_out and case_id = cur.case_id and reopened_at is null) then
      return jsonb_build_object('result', 'case_closed');
    end if;
    update placements set removed_at = now(), removed_by = auth.uid() where id = cur.id;
  end if;

  begin
    insert into placements(load_out_id, item_id, case_id, placed_by, container_item_id)
    values (p_load_out, p_item, v_case, auth.uid(), p_container);
  exception when unique_violation then
    select c.code as case_code, pr.display_name as by_name, p.placed_at, ci.name as container_name into cur
    from placements p join cases c on c.id = p.case_id join profiles pr on pr.id = p.placed_by
    left join items ci on ci.id = p.container_item_id
    where p.load_out_id = p_load_out and p.item_id = p_item and p.removed_at is null;
    return jsonb_build_object('result', 'conflict',
      'case_code', cur.case_code, 'container', cur.container_name, 'by', cur.by_name, 'at', cur.placed_at);
  end;
  return jsonb_build_object('result', 'ok');
end $$;

create or replace function public.unplace_item(p_load_out uuid, p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'non autorizzato'; end if;
  update placements set removed_at = now(), removed_by = auth.uid()
  where load_out_id = p_load_out and item_id = p_item and removed_at is null
    and not exists (select 1 from case_closures cc where cc.load_out_id = p_load_out
                    and cc.case_id = placements.case_id and cc.reopened_at is null)
    and not exists (select 1 from container_closures k where k.load_out_id = p_load_out
                    and k.item_id = placements.container_item_id and k.reopened_at is null);
end $$;

-- ───────────────────────── Chiusura scatola ─────────────────────────
create or replace function public.close_container(
  p_load_out uuid, p_container uuid,
  p_confirm boolean default false, p_force boolean default false, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  missing jsonb;
  elsewhere jsonb;
begin
  if not is_member() then raise exception 'non autorizzato'; end if;
  if not exists (select 1 from items where id = p_container and is_container) then raise exception 'Non è un sottocase'; end if;
  if exists (select 1 from container_closures where load_out_id = p_load_out and item_id = p_container and reopened_at is null) then
    return jsonb_build_object('result', 'already_closed');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('item_id', s.item_id, 'name', s.item_name)), '[]') into missing
  from load_out_item_status s where s.load_out_id = p_load_out and s.parent_item_id = p_container and s.status = 'red';

  select coalesce(jsonb_agg(jsonb_build_object('item_id', s.item_id, 'name', s.item_name,
                    'case_code', c.code, 'container', ci.name, 'by', s.placed_by_name)), '[]') into elsewhere
  from load_out_item_status s join cases c on c.id = s.actual_case_id left join items ci on ci.id = s.actual_container_id
  where s.load_out_id = p_load_out and s.parent_item_id = p_container and s.status = 'orange';

  if jsonb_array_length(missing) > 0 then
    if not (p_force and is_admin() and coalesce(trim(p_note), '') <> '') then
      return jsonb_build_object('result', 'blocked', 'missing', missing, 'elsewhere', elsewhere);
    end if;
  elsif jsonb_array_length(elsewhere) > 0 and not p_confirm then
    return jsonb_build_object('result', 'needs_confirm', 'elsewhere', elsewhere);
  end if;

  insert into container_closures(load_out_id, item_id, closed_by, forced, note)
  values (p_load_out, p_container, auth.uid(), jsonb_array_length(missing) > 0, p_note);
  return jsonb_build_object('result', 'closed', 'elsewhere', elsewhere);
end $$;

-- Riaprire una scatola già messa nel case la "toglie" dal case (va rimessa dopo averla richiusa).
create or replace function public.reopen_container(p_load_out uuid, p_container uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_case uuid;
begin
  if not is_member() then raise exception 'non autorizzato'; end if;
  select case_id into v_case from placements where load_out_id = p_load_out and item_id = p_container and removed_at is null;
  if v_case is not null and exists (select 1 from case_closures where load_out_id = p_load_out and case_id = v_case and reopened_at is null) then
    return jsonb_build_object('result', 'case_closed');
  end if;
  update placements set removed_at = now(), removed_by = auth.uid()
  where load_out_id = p_load_out and item_id = p_container and removed_at is null;
  update container_closures set reopened_at = now(), reopened_by = auth.uid()
  where load_out_id = p_load_out and item_id = p_container and reopened_at is null;
  return jsonb_build_object('result', 'ok');
end $$;

-- ───────────────────────── Chiusura case: le scatole contano come un oggetto ─────────────────────────
-- Gli oggetti DENTRO una scatola non bloccano il case: blocca la scatola (che va chiusa e messa).
create or replace function public.close_case(
  p_load_out uuid, p_case uuid,
  p_confirm boolean default false, p_force boolean default false, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  missing jsonb;
  elsewhere jsonb;
begin
  if not is_member() then raise exception 'non autorizzato'; end if;
  if exists (select 1 from case_closures where load_out_id = p_load_out
             and case_id = p_case and reopened_at is null) then
    return jsonb_build_object('result', 'already_closed');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('item_id', s.item_id, 'name', s.item_name)), '[]')
    into missing
  from load_out_item_status s
  where s.load_out_id = p_load_out and s.expected_case_id = p_case and s.parent_item_id is null and s.status = 'red';

  select coalesce(jsonb_agg(jsonb_build_object('item_id', s.item_id, 'name', s.item_name,
                    'case_code', c.code, 'by', s.placed_by_name)), '[]')
    into elsewhere
  from load_out_item_status s join cases c on c.id = s.actual_case_id
  where s.load_out_id = p_load_out and s.expected_case_id = p_case and s.parent_item_id is null and s.status = 'orange';

  if jsonb_array_length(missing) > 0 then
    if not (p_force and is_admin() and coalesce(trim(p_note), '') <> '') then
      return jsonb_build_object('result', 'blocked', 'missing', missing, 'elsewhere', elsewhere);
    end if;
  elsif jsonb_array_length(elsewhere) > 0 and not p_confirm then
    return jsonb_build_object('result', 'needs_confirm', 'elsewhere', elsewhere);
  end if;

  insert into case_closures(load_out_id, case_id, closed_by, forced, note)
  values (p_load_out, p_case, auth.uid(), jsonb_array_length(missing) > 0, p_note);
  return jsonb_build_object('result', 'closed', 'elsewhere', elsewhere);
end $$;

-- ───────────────────────── Risoluzioni automatiche: "al suo posto" = nella sua scatola ─────────────────────────
create or replace function public.trg_autoresolve_issues()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_test_load_out(new.load_out_id) then return new; end if;
  update load_out_issues i set status = 'resolved',
    resolution = case when i.kind = 'missing' then 'found' else 'fixed' end,
    resolved_by = new.placed_by, resolved_at = now(),
    note = coalesce(i.note, 'Risolto automaticamente allo smontaggio successivo')
  from items it
  where i.item_id = new.item_id and it.id = new.item_id
    and i.status = 'open' and i.load_out_id <> new.load_out_id
    and (i.kind = 'missing'
         or (it.parent_item_id is null and new.case_id = it.expected_case_id)
         or (it.parent_item_id is not null and new.container_item_id = it.parent_item_id));
  return new;
end $$;

create or replace function public.trg_return_checkout_on_place()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_test_load_out(new.load_out_id) then return new; end if;
  update item_checkouts c set returned_at = now(), returned_by = new.placed_by,
    return_note = coalesce(return_note, 'Rimesso nel case durante lo smontaggio')
  from items it
  where c.item_id = new.item_id and it.id = new.item_id and c.returned_at is null
    and ((it.parent_item_id is null and new.case_id = it.expected_case_id)
         or (it.parent_item_id is not null and new.container_item_id = it.parent_item_id));
  return new;
end $$;

-- ───────────────────────── Registro ─────────────────────────
create or replace function public.container_label(p uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce('«' || (select name from items where id = p) || '»', '«?»');
$$;

create or replace function public.trg_log_placement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_expected uuid; v_parent uuid; v_ok boolean; v_where text; v_should text;
begin
  select expected_case_id, parent_item_id into v_expected, v_parent from items where id = new.item_id;
  v_where := case when new.container_item_id is not null
                  then 'nella ' || container_label(new.container_item_id) || ' (' || case_label(new.case_id) || ')'
                  else 'nel ' || case_label(new.case_id) end;
  if tg_op = 'INSERT' then
    v_ok := case when v_parent is not null then new.container_item_id is not distinct from v_parent
                 else new.case_id = v_expected end;
    v_should := case when v_parent is not null then 'nella ' || container_label(v_parent) else 'nel ' || case_label(v_expected) end;
    perform log_event(case when v_ok then 'placed' else 'placed_elsewhere' end, new.placed_by,
      'ha messo ' || item_label(new.item_id) || ' ' || v_where
        || case when v_ok then '' else ' (dovrebbe stare ' || v_should || ')' end,
      new.load_out_id, new.item_id, new.case_id,
      jsonb_build_object('expected_case_id', v_expected, 'container_item_id', new.container_item_id), new.placed_at);
  elsif old.removed_at is null and new.removed_at is not null then
    perform log_event('removed', new.removed_by,
      'ha tolto ' || item_label(new.item_id) || ' dal' || case when new.container_item_id is not null
        then 'la ' || container_label(new.container_item_id) || ' (' || case_label(new.case_id) || ')' else ' ' || case_label(new.case_id) end,
      new.load_out_id, new.item_id, new.case_id, '{}', new.removed_at);
  end if;
  return new;
end $$;

create or replace function public.trg_log_container_closure()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_event(case when new.forced then 'container_forced' else 'container_closed' end, new.closed_by,
      case when new.forced then 'ha FORZATO la chiusura della ' || container_label(new.item_id) || ' (nota: ' || coalesce(new.note, '') || ')'
           else 'ha chiuso la ' || container_label(new.item_id) end,
      new.load_out_id, new.item_id, null, jsonb_build_object('note', new.note), new.closed_at);
  elsif old.reopened_at is null and new.reopened_at is not null then
    perform log_event('container_reopened', new.reopened_by, 'ha riaperto la ' || container_label(new.item_id),
      new.load_out_id, new.item_id, null, '{}', new.reopened_at);
  end if;
  return new;
end $$;
drop trigger if exists log_container_closure on public.container_closures;
create trigger log_container_closure after insert or update on public.container_closures
for each row execute function public.trg_log_container_closure();

-- Catalogo: registra anche "reso sottocase" e "messo dentro la scatola"
create or replace function public.trg_log_catalog()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'cases' then
    perform log_event(case when tg_op = 'INSERT' then 'case_created' else 'case_updated' end, auth.uid(),
      case when tg_op = 'INSERT' then 'ha creato il ' else 'ha modificato il ' end || 'case ' || new.code || ' «' || new.name || '»',
      null, null, new.id);
  elsif tg_op = 'INSERT' then
    perform log_event('item_created', auth.uid(),
      'ha creato l''oggetto «' || new.name || '» '
        || case when new.parent_item_id is not null then 'dentro la ' || container_label(new.parent_item_id) else 'nel ' || case_label(new.expected_case_id) end,
      null, new.id, new.expected_case_id);
  else
    if new.is_container is distinct from old.is_container then
      perform log_event('item_container', auth.uid(),
        case when new.is_container then 'ha reso «' || new.name || '» un sottocase' else 'ha tolto «' || new.name || '» dai sottocase' end,
        null, new.id, null);
    end if;
    if new.parent_item_id is distinct from old.parent_item_id then
      perform log_event('item_parent', auth.uid(),
        case when new.parent_item_id is not null then 'ha messo «' || new.name || '» dentro la ' || container_label(new.parent_item_id)
             else 'ha tolto «' || new.name || '» dalla ' || container_label(old.parent_item_id) end,
        null, new.id, null);
    end if;
    if (old.name, old.aliases, old.notes, old.photo_path, old.layout_photos)
       is distinct from (new.name, new.aliases, new.notes, new.photo_path, new.layout_photos) then
      perform log_event('item_updated', auth.uid(), 'ha modificato l''oggetto «' || new.name || '»', null, new.id, null);
    end if;
  end if;
  return new;
end $$;

-- ───────────────────────── Tempo reale ─────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.container_closures;
exception when duplicate_object then null;
end $$;
