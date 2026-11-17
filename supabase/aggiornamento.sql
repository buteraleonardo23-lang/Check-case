-- ═══════════════════════════════════════════════════════════════
-- Check-case · AGGIORNAMENTO del database già in uso (0003_log_e_da_sistemare.sql, 0004_realtime_ovunque.sql, 0005_prova_eventi_foto.sql)
-- PRIMA lancia supabase/backup.sql. Poi incolla tutto questo nello SQL Editor e premi Run.
-- Si può lanciare anche più volte e in qualsiasi stato: aggiunge solo quello che manca,
-- non cancella e non modifica i dati esistenti (oggetti, case, foto, storico).
-- (Generato da scripts/gen-setup-sql.mjs)
-- ═══════════════════════════════════════════════════════════════

-- ───────── 0003_log_e_da_sistemare.sql ─────────
-- ═══════════════════════════════════════════════════════════════
-- 0003 · Registro attività + chiusura smontaggio con riepilogo + "Da sistemare"
-- Rilanciabile: usa "if not exists" / "create or replace".
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────── Registro attività ─────────────────────────
-- Append-only: scritto SOLO dai trigger qui sotto, letto solo dagli admin.
create table if not exists public.activity_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  action text not null,
  load_out_id uuid references public.load_outs(id) on delete set null,
  item_id uuid references public.items(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  message text not null,
  details jsonb not null default '{}'
);
create index if not exists activity_log_lo_idx on public.activity_log(load_out_id, at);
create index if not exists activity_log_at_idx on public.activity_log(at desc);

alter table public.activity_log enable row level security;
drop policy if exists read_log on public.activity_log;
create policy read_log on public.activity_log for select using (is_admin());

create or replace function public.actor_name(p uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from profiles where id = p), 'Sistema');
$$;
create or replace function public.item_label(p uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce('«' || (select name from items where id = p) || '»', '«?»');
$$;
create or replace function public.case_label(p uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce('case ' || (select code from cases where id = p), 'nessun case');
$$;

create or replace function public.log_event(
  p_action text, p_actor uuid, p_message text,
  p_load_out uuid default null, p_item uuid default null, p_case uuid default null,
  p_details jsonb default '{}', p_at timestamptz default now()
) returns void language sql security definer set search_path = public as $$
  insert into activity_log(at, actor_id, actor_name, action, load_out_id, item_id, case_id, message, details)
  values (p_at, p_actor, actor_name(p_actor), p_action, p_load_out, p_item, p_case,
          actor_name(p_actor) || ' ' || p_message, coalesce(p_details, '{}'));
$$;

-- placements: messo / tolto
create or replace function public.trg_log_placement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_expected uuid;
begin
  select expected_case_id into v_expected from items where id = new.item_id;
  if tg_op = 'INSERT' then
    perform log_event(
      case when new.case_id = v_expected then 'placed' else 'placed_elsewhere' end,
      new.placed_by,
      'ha messo ' || item_label(new.item_id) || ' nel ' || case_label(new.case_id)
        || case when v_expected is distinct from new.case_id
                then ' (dovrebbe stare nel ' || case_label(v_expected) || ')' else '' end,
      new.load_out_id, new.item_id, new.case_id,
      jsonb_build_object('expected_case_id', v_expected), new.placed_at);
  elsif old.removed_at is null and new.removed_at is not null then
    perform log_event('removed', new.removed_by,
      'ha tolto ' || item_label(new.item_id) || ' dal ' || case_label(new.case_id),
      new.load_out_id, new.item_id, new.case_id, '{}', new.removed_at);
  end if;
  return new;
end $$;
drop trigger if exists log_placement on public.placements;
create trigger log_placement after insert or update on public.placements
for each row execute function public.trg_log_placement();

-- case_closures: chiuso / forzato / riaperto
create or replace function public.trg_log_closure()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_event(case when new.forced then 'case_forced' else 'case_closed' end, new.closed_by,
      case when new.forced then 'ha FORZATO la chiusura del ' || case_label(new.case_id) || ' (nota: ' || coalesce(new.note, '') || ')'
           else 'ha chiuso il ' || case_label(new.case_id) end,
      new.load_out_id, null, new.case_id, jsonb_build_object('note', new.note), new.closed_at);
  elsif old.reopened_at is null and new.reopened_at is not null then
    perform log_event('case_reopened', new.reopened_by, 'ha riaperto il ' || case_label(new.case_id),
      new.load_out_id, null, new.case_id, '{}', new.reopened_at);
  end if;
  return new;
end $$;
drop trigger if exists log_closure on public.case_closures;
create trigger log_closure after insert or update on public.case_closures
for each row execute function public.trg_log_closure();

-- load_outs: iniziato / concluso
create or replace function public.trg_log_load_out()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_event('load_out_started', coalesce(new.created_by, auth.uid()), 'ha iniziato lo smontaggio',
      new.id, null, null, '{}', new.started_at);
  elsif old.status = 'open' and new.status = 'closed' then
    perform log_event('load_out_ended', auth.uid(), 'ha concluso lo smontaggio', new.id, null, null, '{}',
      coalesce(new.ended_at, now()));
  end if;
  return new;
end $$;
drop trigger if exists log_load_out on public.load_outs;
create trigger log_load_out after insert or update on public.load_outs
for each row execute function public.trg_log_load_out();

-- item_moves: riassegnazione definitiva
create or replace function public.trg_log_move()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_event('item_reassigned', new.created_by,
      'ha assegnato ' || item_label(new.item_id) || ' al ' || case_label(new.to_case_id)
        || ' (prima ' || case_label(new.from_case_id) || ')'
        || case when new.status = 'pending' then ' — da spostare alla prossima replica' else ' — già lì' end,
      null, new.item_id, new.to_case_id, jsonb_build_object('note', new.note), new.created_at);
  elsif old.status = 'pending' and new.status = 'done' then
    perform log_event('move_done', coalesce(new.completed_by, auth.uid()),
      'ha completato lo spostamento di ' || item_label(new.item_id) || ' nel ' || case_label(new.to_case_id),
      null, new.item_id, new.to_case_id);
  end if;
  return new;
end $$;
drop trigger if exists log_move on public.item_moves;
create trigger log_move after insert or update on public.item_moves
for each row execute function public.trg_log_move();

-- catalogo: case e oggetti creati / modificati
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
  elsif (old.name, old.aliases, old.notes, old.photo_path, old.active)
        is distinct from (new.name, new.aliases, new.notes, new.photo_path, new.active) then
    perform log_event('item_updated', auth.uid(), 'ha modificato l''oggetto «' || new.name || '»', null, new.id, null);
  end if;
  return new;
end $$;
drop trigger if exists log_cases on public.cases;
create trigger log_cases after insert or update on public.cases
for each row execute function public.trg_log_catalog();
drop trigger if exists log_items on public.items;
create trigger log_items after insert or update on public.items
for each row execute function public.trg_log_catalog();

-- ───────────────────────── Da sistemare ─────────────────────────
-- Creati alla chiusura dello smontaggio:
--   misplaced = oggetto finito in un case diverso dal suo
--   missing   = oggetto non segnato in nessun case (perso o dimenticato)
-- Stato: open → (lost: confermato perso, da ricomprare) → resolved
create table if not exists public.load_out_issues (
  id uuid primary key default gen_random_uuid(),
  load_out_id uuid not null references public.load_outs(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  kind text not null check (kind in ('misplaced', 'missing')),
  expected_case_id uuid references public.cases(id) on delete set null,
  actual_case_id uuid references public.cases(id) on delete set null,
  placed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'lost', 'resolved')),
  resolution text check (resolution in ('fixed', 'reassigned', 'found', 'replaced', 'dismissed')),
  note text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  unique (load_out_id, item_id)
);
create index if not exists load_out_issues_open on public.load_out_issues(item_id) where status <> 'resolved';

alter table public.load_out_issues enable row level security;
drop policy if exists read_issues on public.load_out_issues;
create policy read_issues on public.load_out_issues for select using (is_member());

-- Riepilogo di uno smontaggio (prima di chiuderlo)
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
      where s.load_out_id = p_load_out and s.status = 'red'), '[]'),
    'open_cases', coalesce((
      select jsonb_agg(c.code order by c.sort_order, c.code) from cases c
      where c.active and not exists (select 1 from case_closures cc
        where cc.load_out_id = p_load_out and cc.case_id = c.id and cc.reopened_at is null)), '[]'),
    'placed', (select count(*) from load_out_item_status s where s.load_out_id = p_load_out and s.status <> 'red'),
    'total', (select count(*) from load_out_item_status s where s.load_out_id = p_load_out)
  );
$$;

-- Crea le voci "da sistemare" di uno smontaggio (idempotente)
create or replace function public.create_issues(p_load_out uuid)
returns void language sql security definer set search_path = public as $$
  insert into load_out_issues(load_out_id, item_id, kind, expected_case_id, actual_case_id, placed_by, created_at)
  select s.load_out_id, s.item_id,
         case when s.status = 'orange' then 'misplaced' else 'missing' end,
         s.expected_case_id, s.actual_case_id, s.placed_by,
         coalesce((select ended_at from load_outs where id = p_load_out), now())
  from load_out_item_status s
  where s.load_out_id = p_load_out and s.status in ('orange', 'red')
  on conflict (load_out_id, item_id) do nothing;
$$;

-- Chiusura smontaggio: senza conferma restituisce il riepilogo, con conferma chiude e crea le voci
create or replace function public.end_load_out(p_load_out uuid, p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_summary jsonb;
begin
  if not is_admin() then raise exception 'Solo un admin può concludere lo smontaggio'; end if;
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
      || jsonb_array_length(v_summary->'missing') || ' non trovati',
    p_load_out, null, null, v_summary);
  return jsonb_build_object('result', 'closed', 'summary', v_summary);
end $$;

-- Risoluzione manuale di una voce
--   misplaced: fixed (rimesso a posto) | reassigned (resta lì: cambio case) | dismissed
--   missing:   found | lost (confermato perso → da ricomprare) | replaced | dismissed
create or replace function public.resolve_issue(p_issue uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v load_out_issues%rowtype;
begin
  if not is_admin() then raise exception 'Solo un admin può risolvere'; end if;
  select * into v from load_out_issues where id = p_issue for update;
  if not found then raise exception 'Voce non trovata'; end if;
  if p_action = 'reassigned' then
    if v.actual_case_id is null then raise exception 'Nessun case dove lasciarlo'; end if;
    perform move_item(v.item_id, v.actual_case_id, false, coalesce(p_note, 'Lasciato dove l''avete messo'));
  end if;
  if p_action = 'lost' then
    update load_out_issues set status = 'lost', note = coalesce(p_note, note) where id = p_issue;
    perform log_event('issue_lost', auth.uid(), 'ha confermato PERSO ' || item_label(v.item_id) || ' — da ricomprare',
      v.load_out_id, v.item_id, v.expected_case_id);
  elsif p_action in ('fixed', 'reassigned', 'found', 'replaced', 'dismissed') then
    update load_out_issues set status = 'resolved', resolution = p_action, note = coalesce(p_note, note),
      resolved_by = auth.uid(), resolved_at = now() where id = p_issue;
    perform log_event('issue_' || p_action, auth.uid(),
      case p_action
        when 'fixed' then 'ha rimesso a posto ' || item_label(v.item_id) || ' nel ' || case_label(v.expected_case_id)
        when 'reassigned' then 'ha deciso che ' || item_label(v.item_id) || ' resta nel ' || case_label(v.actual_case_id)
        when 'found' then 'ha ritrovato ' || item_label(v.item_id)
        when 'replaced' then 'ha ricomprato/sostituito ' || item_label(v.item_id)
        else 'ha ignorato la segnalazione su ' || item_label(v.item_id) end
        || coalesce(' (' || p_note || ')', ''),
      v.load_out_id, v.item_id, null);
  else
    raise exception 'Azione non valida: %', p_action;
  end if;
end $$;

-- Stessa azione su più voci insieme (es. "Ignora tutti" dopo uno smontaggio di prova)
create or replace function public.resolve_issues(p_issues uuid[], p_action text, p_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v uuid; n int := 0;
begin
  if not is_admin() then raise exception 'Solo un admin può risolvere'; end if;
  foreach v in array coalesce(p_issues, '{}') loop
    perform resolve_issue(v, p_action, p_note);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Risoluzione automatica: al prossimo smontaggio
--   oggetto messo nel suo case → misplaced "fixed"; oggetto messo ovunque → missing "found"
create or replace function public.trg_autoresolve_issues()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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
drop trigger if exists autoresolve_issues on public.placements;
create trigger autoresolve_issues after insert on public.placements
for each row execute function public.trg_autoresolve_issues();

-- Riassegnare un oggetto chiude le sue voci "nel case sbagliato" se ora quello è il suo case
create or replace function public.trg_move_resolves_issue()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update load_out_issues set status = 'resolved', resolution = 'reassigned',
    resolved_by = new.created_by, resolved_at = now()
  where item_id = new.item_id and kind = 'misplaced' and status = 'open' and actual_case_id = new.to_case_id;
  return new;
end $$;
drop trigger if exists move_resolves_issue on public.item_moves;
create trigger move_resolves_issue after insert on public.item_moves
for each row execute function public.trg_move_resolves_issue();

-- La chiusura diretta dalla tabella non è più permessa: si passa da end_load_out (riepilogo + voci)
drop policy if exists admin_load_outs on public.load_outs;
drop policy if exists admin_load_outs_insert on public.load_outs;
create policy admin_load_outs_insert on public.load_outs for insert with check (is_admin());

-- ───────────────────────── Recupero dello storico già esistente ─────────────────────────
-- Ricostruisce il registro dalle azioni fatte prima di questa migration (solo se il registro è vuoto).
do $$
begin
  if not exists (select 1 from activity_log) then
    insert into activity_log(at, actor_id, actor_name, action, load_out_id, message)
    select lo.started_at, lo.created_by, actor_name(lo.created_by), 'load_out_started', lo.id,
           actor_name(lo.created_by) || ' ha iniziato lo smontaggio'
    from load_outs lo;

    insert into activity_log(at, actor_id, actor_name, action, load_out_id, item_id, case_id, message)
    select p.placed_at, p.placed_by, actor_name(p.placed_by),
           case when p.case_id = i.expected_case_id then 'placed' else 'placed_elsewhere' end,
           p.load_out_id, p.item_id, p.case_id,
           actor_name(p.placed_by) || ' ha messo ' || item_label(p.item_id) || ' nel ' || case_label(p.case_id)
             || case when i.expected_case_id is distinct from p.case_id
                     then ' (dovrebbe stare nel ' || case_label(i.expected_case_id) || ')' else '' end
    from placements p join items i on i.id = p.item_id;

    insert into activity_log(at, actor_id, actor_name, action, load_out_id, item_id, case_id, message)
    select p.removed_at, p.removed_by, actor_name(p.removed_by), 'removed', p.load_out_id, p.item_id, p.case_id,
           actor_name(p.removed_by) || ' ha tolto ' || item_label(p.item_id) || ' dal ' || case_label(p.case_id)
    from placements p where p.removed_at is not null;

    insert into activity_log(at, actor_id, actor_name, action, load_out_id, case_id, message)
    select cc.closed_at, cc.closed_by, actor_name(cc.closed_by),
           case when cc.forced then 'case_forced' else 'case_closed' end, cc.load_out_id, cc.case_id,
           actor_name(cc.closed_by) || case when cc.forced then ' ha FORZATO la chiusura del ' else ' ha chiuso il ' end
             || case_label(cc.case_id) || coalesce(' (nota: ' || cc.note || ')', '')
    from case_closures cc;

    insert into activity_log(at, actor_id, actor_name, action, load_out_id, case_id, message)
    select cc.reopened_at, cc.reopened_by, actor_name(cc.reopened_by), 'case_reopened', cc.load_out_id, cc.case_id,
           actor_name(cc.reopened_by) || ' ha riaperto il ' || case_label(cc.case_id)
    from case_closures cc where cc.reopened_at is not null;

    insert into activity_log(at, actor_id, actor_name, action, load_out_id, message)
    select coalesce(lo.ended_at, lo.started_at), null, 'Sistema', 'load_out_ended', lo.id, 'Sistema: smontaggio concluso'
    from load_outs lo where lo.status = 'closed';

    insert into activity_log(at, actor_id, actor_name, action, item_id, case_id, message)
    select m.created_at, m.created_by, actor_name(m.created_by), 'item_reassigned', m.item_id, m.to_case_id,
           actor_name(m.created_by) || ' ha assegnato ' || item_label(m.item_id) || ' al ' || case_label(m.to_case_id)
             || ' (prima ' || case_label(m.from_case_id) || ')'
    from item_moves m;
  end if;
end $$;

-- Gli smontaggi già conclusi prima di questa migration ottengono le loro voci "da sistemare"
do $$
declare r record;
begin
  for r in select id from load_outs lo where status = 'closed'
           and not exists (select 1 from load_out_issues i where i.load_out_id = lo.id) loop
    perform create_issues(r.id);
  end loop;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.activity_log;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.load_out_issues;
exception when duplicate_object then null;
end $$;

-- ───────── 0004_realtime_ovunque.sql ─────────
-- ═══════════════════════════════════════════════════════════════
-- 0004 · Tempo reale anche per avvio/chiusura smontaggio e catalogo
-- Senza questo, quando un admin avvia lo smontaggio gli altri telefoni non lo sanno
-- finché non ricaricano la pagina. Rilanciabile.
-- ═══════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['load_outs', 'cases', 'items', 'placements', 'case_closures', 'item_moves', 'load_out_issues'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Controllo: deve elencare tutte le tabelle qui sopra
select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1;

-- ───────── 0005_prova_eventi_foto.sql ─────────
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

select 'AGGIORNAMENTO COMPLETATO' as esito;
