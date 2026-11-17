-- ═══════════════════════════════════════════════════════════════
-- 0005 · Foto "come è dentro" multiple · Smontaggio di prova · "Ho un altro evento" · Cestino oggetti
-- Solo AGGIUNTE: nessun dato esistente viene modificato o cancellato. Rilanciabile.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────── Foto "come è dentro" (più di una) ─────────────────────────
-- layout_photo_path resta la prima foto; le altre si aggiungono qui.
alter table public.cases add column if not exists layout_photos text[] not null default '{}';

-- ───────────────────────── Smontaggio di prova ─────────────────────────
alter table public.load_outs add column if not exists is_test boolean not null default false;

-- Una prova non deve toccare i dati veri: niente risoluzioni automatiche né spostamenti completati.
create or replace function public.is_test_load_out(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_test from load_outs where id = p), false);
$$;

create or replace function public.trg_complete_move_on_place()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_test_load_out(new.load_out_id) then return new; end if;
  update item_moves set status = 'done', completed_at = now(), completed_by = new.placed_by
  where item_id = new.item_id and status = 'pending' and to_case_id = new.case_id;
  return new;
end $$;

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
    and (i.kind = 'missing' or new.case_id = it.expected_case_id);
  return new;
end $$;

-- Chiude la prova e butta via tutto quello che è stato segnato (registro compreso).
create or replace function public.discard_test_load_out(p_load_out uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_started timestamptz;
begin
  if not is_admin() then raise exception 'Solo un admin può chiudere la prova'; end if;
  select started_at into v_started from load_outs where id = p_load_out and is_test;
  if not found then raise exception 'Non è uno smontaggio di prova'; end if;
  delete from activity_log where load_out_id = p_load_out;
  delete from load_outs where id = p_load_out;   -- placements, chiusure e voci vanno via a cascata
  perform log_event('test_discarded', auth.uid(),
    'ha fatto uno smontaggio di prova (iniziato alle ' || to_char(v_started at time zone 'Europe/Rome', 'HH24:MI') || ', dati scartati)');
end $$;

-- Una prova non si "conclude" col riepilogo: si scarta.
create or replace function public.end_load_out(p_load_out uuid, p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_summary jsonb;
begin
  if not is_admin() then raise exception 'Solo un admin può concludere lo smontaggio'; end if;
  if is_test_load_out(p_load_out) then raise exception 'È uno smontaggio di prova: usa "Chiudi prova"'; end if;
  if not exists (select 1 from load_outs where id = p_load_out and status = 'open') then
    return jsonb_build_object('result', 'already_closed');
  end if;
  v_summary := load_out_summary(p_load_out);
  if not p_confirm then
    return jsonb_build_object('result', 'needs_confirm', 'summary', v_summary);
  end if;
  update load_outs set status = 'closed', ended_at = now() where id = p_load_out;
  perform create_issues(p_load_out);
  perform log_event('load_out_summary', auth.uid(),
    'ha confermato il riepilogo: ' || jsonb_array_length(v_summary->'misplaced') || ' nel case sbagliato, '
      || jsonb_array_length(v_summary->'missing') || ' non trovati'
      || case when jsonb_array_length(v_summary->'checked_out') > 0
              then ', ' || jsonb_array_length(v_summary->'checked_out') || ' fuori per un altro evento' else '' end,
    p_load_out, null, null, v_summary);
  return jsonb_build_object('result', 'closed', 'summary', v_summary);
end $$;

-- ───────────────────────── "Ho un altro evento" ─────────────────────────
-- Oggetti presi dai case per un evento extra: restano "fuori" finché non vengono rimessi.
create table if not exists public.item_checkouts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  from_case_id uuid references public.cases(id) on delete set null,
  event_name text,
  taken_by uuid references public.profiles(id) on delete set null,
  taken_at timestamptz not null default now(),
  returned_at timestamptz,
  returned_by uuid references public.profiles(id) on delete set null,
  return_note text
);
create unique index if not exists item_checkouts_one_open on public.item_checkouts(item_id) where returned_at is null;

alter table public.item_checkouts enable row level security;
drop policy if exists read_checkouts on public.item_checkouts;
create policy read_checkouts on public.item_checkouts for select using (is_member());

create or replace function public.checkout_item(p_item uuid, p_from_case uuid, p_event text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo un admin può segnare gli oggetti presi per un evento'; end if;
  if exists (select 1 from item_checkouts where item_id = p_item and returned_at is null) then
    return jsonb_build_object('result', 'already_out');
  end if;
  insert into item_checkouts(item_id, from_case_id, event_name, taken_by)
  values (p_item, coalesce(p_from_case, (select expected_case_id from items where id = p_item)), nullif(trim(p_event), ''), auth.uid());
  perform log_event('item_checked_out', auth.uid(),
    'ha preso ' || item_label(p_item) || ' dal ' || case_label(coalesce(p_from_case, (select expected_case_id from items where id = p_item)))
      || coalesce(' per «' || nullif(trim(p_event), '') || '»', ' per un altro evento'),
    null, p_item, p_from_case);
  return jsonb_build_object('result', 'ok');
end $$;

create or replace function public.return_checkouts(p_ids uuid[], p_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not is_admin() then raise exception 'Solo un admin può farlo'; end if;
  for r in select * from item_checkouts where id = any(coalesce(p_ids, '{}')) and returned_at is null for update loop
    update item_checkouts set returned_at = now(), returned_by = auth.uid(), return_note = p_note where id = r.id;
    perform log_event('item_returned', auth.uid(),
      'ha rimesso ' || item_label(r.item_id) || ' nel ' || case_label((select expected_case_id from items where id = r.item_id))
        || coalesce(' (' || p_note || ')', ''), null, r.item_id, null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Se allo smontaggio l'oggetto preso viene rimesso nel suo case, risulta rientrato da solo.
create or replace function public.trg_return_checkout_on_place()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_test_load_out(new.load_out_id) then return new; end if;
  update item_checkouts c set returned_at = now(), returned_by = new.placed_by,
    return_note = coalesce(return_note, 'Rimesso nel case durante lo smontaggio')
  from items it
  where c.item_id = new.item_id and it.id = new.item_id and c.returned_at is null and new.case_id = it.expected_case_id;
  return new;
end $$;
drop trigger if exists return_checkout_on_place on public.placements;
create trigger return_checkout_on_place after insert on public.placements
for each row execute function public.trg_return_checkout_on_place();

-- Riepilogo: gli oggetti "fuori per un evento" non sono "non trovati", li elenca a parte.
create or replace function public.load_out_summary(p_load_out uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'misplaced', coalesce((
      select jsonb_agg(jsonb_build_object('item_id', s.item_id, 'name', s.item_name,
        'expected_code', ce.code, 'actual_code', ca.code, 'by', s.placed_by_name, 'at', s.placed_at) order by ce.code, s.item_name)
      from load_out_item_status s
      left join cases ce on ce.id = s.expected_case_id
      join cases ca on ca.id = s.actual_case_id
      where s.load_out_id = p_load_out and s.status = 'orange'), '[]'),
    'missing', coalesce((
      select jsonb_agg(jsonb_build_object('item_id', s.item_id, 'name', s.item_name,
        'expected_code', ce.code) order by ce.code, s.item_name)
      from load_out_item_status s
      left join cases ce on ce.id = s.expected_case_id
      where s.load_out_id = p_load_out and s.status = 'red'
        and not exists (select 1 from item_checkouts k where k.item_id = s.item_id and k.returned_at is null)), '[]'),
    'checked_out', coalesce((
      select jsonb_agg(jsonb_build_object('item_id', s.item_id, 'name', s.item_name,
        'expected_code', ce.code, 'event', k.event_name) order by ce.code, s.item_name)
      from load_out_item_status s
      join item_checkouts k on k.item_id = s.item_id and k.returned_at is null
      left join cases ce on ce.id = s.expected_case_id
      where s.load_out_id = p_load_out and s.status = 'red'), '[]'),
    'open_cases', coalesce((
      select jsonb_agg(c.code order by c.sort_order, c.code) from cases c
      where c.active and not exists (select 1 from case_closures cc
        where cc.load_out_id = p_load_out and cc.case_id = c.id and cc.reopened_at is null)), '[]'),
    'placed', (select count(*) from load_out_item_status s where s.load_out_id = p_load_out and s.status <> 'red'),
    'total', (select count(*) from load_out_item_status s where s.load_out_id = p_load_out)
  );
$$;

-- Alla chiusura: niente voce "non trovato" per gli oggetti fuori per un evento (sono già tracciati).
create or replace function public.create_issues(p_load_out uuid)
returns void language sql security definer set search_path = public as $$
  insert into load_out_issues(load_out_id, item_id, kind, expected_case_id, actual_case_id, placed_by, created_at)
  select s.load_out_id, s.item_id,
         case when s.status = 'orange' then 'misplaced' else 'missing' end,
         s.expected_case_id, s.actual_case_id, s.placed_by,
         coalesce((select ended_at from load_outs where id = p_load_out), now())
  from load_out_item_status s
  where s.load_out_id = p_load_out and s.status in ('orange', 'red')
    and not (s.status = 'red' and exists (select 1 from item_checkouts k where k.item_id = s.item_id and k.returned_at is null))
    -- un oggetto catalogato DOPO la chiusura di quello smontaggio non può esserci stato
    and not exists (select 1 from items it where it.id = s.item_id
                    and it.created_at > coalesce((select ended_at from load_outs where id = p_load_out), now()))
  on conflict (load_out_id, item_id) do nothing;
$$;

-- ───────────────────────── Cestino oggetti (solo admin) ─────────────────────────
-- "Elimina" sposta nel cestino (active = false): l'oggetto sparisce da case, ricerca e smontaggi
-- ma resta tutto, storico compreso, e si può RIPRISTINARE. Solo "Elimina per sempre" cancella davvero.
alter table public.items add column if not exists deleted_at timestamptz;
alter table public.items add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

create or replace function public.trash_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo un admin può eliminare oggetti'; end if;
  update items set active = false, deleted_at = now(), deleted_by = auth.uid() where id = p_item and active;
  if not found then raise exception 'Oggetto non trovato o già nel cestino'; end if;
  perform log_event('item_trashed', auth.uid(),
    'ha spostato nel cestino ' || item_label(p_item) || ' (era nel ' || case_label((select expected_case_id from items where id = p_item)) || ')',
    null, p_item, null);
end $$;

create or replace function public.restore_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo un admin può ripristinare oggetti'; end if;
  update items set active = true, deleted_at = null, deleted_by = null where id = p_item and not active;
  if not found then raise exception 'Oggetto non trovato nel cestino'; end if;
  perform log_event('item_restored', auth.uid(),
    'ha ripristinato ' || item_label(p_item) || ' nel ' || case_label((select expected_case_id from items where id = p_item)),
    null, p_item, null);
end $$;

-- Elimina per sempre: SOLO oggetti già nel cestino (doppia sicurezza).
create or replace function public.delete_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_case uuid;
begin
  if not is_admin() then raise exception 'Solo un admin può eliminare oggetti'; end if;
  select name, expected_case_id into v_name, v_case from items where id = p_item and not active;
  if not found then raise exception 'Si possono eliminare per sempre solo gli oggetti nel cestino'; end if;
  perform log_event('item_deleted', auth.uid(),
    'ha eliminato per sempre l''oggetto «' || v_name || '» (era nel ' || case_label(v_case) || ')', null, null, v_case);
  delete from placements where item_id = p_item;
  delete from damage_reports where item_id = p_item;
  delete from items where id = p_item;          -- spostamenti, voci e prese per eventi vanno via a cascata
end $$;

create or replace function public.empty_trash()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not is_admin() then raise exception 'Solo un admin può svuotare il cestino'; end if;
  for r in select id from items where not active loop
    perform delete_item(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Il registro del catalogo non duplica le righe di cestino/ripristino (le scrivono le funzioni sopra).
create or replace function public.trg_log_catalog()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'cases' then
    perform log_event(case when tg_op = 'INSERT' then 'case_created' else 'case_updated' end, auth.uid(),
      case when tg_op = 'INSERT' then 'ha creato il ' else 'ha modificato il ' end || 'case ' || new.code || ' «' || new.name || '»',
      null, null, new.id);
  elsif tg_op = 'INSERT' then
    perform log_event('item_created', auth.uid(),
      'ha creato l''oggetto «' || new.name || '» nel ' || case_label(new.expected_case_id), null, new.id, new.expected_case_id);
  elsif (old.name, old.aliases, old.notes, old.photo_path)
        is distinct from (new.name, new.aliases, new.notes, new.photo_path) then
    perform log_event('item_updated', auth.uid(), 'ha modificato l''oggetto «' || new.name || '»', null, new.id, null);
  end if;
  return new;
end $$;

-- ───────────────────────── Tempo reale ─────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.item_checkouts;
exception when duplicate_object then null;
end $$;
