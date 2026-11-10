-- ═══════════════════════════════════════════════════════════════
-- Check-case · SETUP COMPLETO (passo 2 della guida)
-- Incolla tutto nello SQL Editor di Supabase e premi Run.
-- ═══════════════════════════════════════════════════════════════

-- Check-case: schema iniziale
-- Regole di dominio: vedi CLAUDE.md

create extension if not exists pgcrypto;

-- ───────────────────────── Tabelle ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  role text not null default 'operator' check (role in ('admin', 'operator')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,              -- es. "08"
  name text not null,
  color text,
  photo_path text,                        -- foto del case (copertina carosello)
  layout_photo_path text,                 -- foto di riferimento: come va riempito
  notes text,
  sort_order int not null default 0,
  active boolean not null default true
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  aliases text[] not null default '{}',
  expected_case_id uuid references public.cases(id) on delete set null,
  photo_path text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index items_expected_case_idx on public.items(expected_case_id);

create table public.shows (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  venue text
);

create table public.load_outs (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references public.shows(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references public.profiles(id)
);
-- un solo smontaggio aperto alla volta
create unique index load_outs_one_open on public.load_outs((true)) where status = 'open';

create table public.placements (
  id uuid primary key default gen_random_uuid(),
  load_out_id uuid not null references public.load_outs(id) on delete cascade,
  item_id uuid not null references public.items(id),
  case_id uuid not null references public.cases(id),
  placed_by uuid not null references public.profiles(id),
  placed_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles(id)
);
-- Un oggetto, un posto: al massimo un placement attivo per oggetto e smontaggio
create unique index placements_one_active
  on public.placements(load_out_id, item_id) where removed_at is null;
create index placements_case_idx on public.placements(load_out_id, case_id) where removed_at is null;

create table public.case_closures (
  id uuid primary key default gen_random_uuid(),
  load_out_id uuid not null references public.load_outs(id) on delete cascade,
  case_id uuid not null references public.cases(id),
  closed_by uuid not null references public.profiles(id),
  closed_at timestamptz not null default now(),
  reopened_at timestamptz,
  reopened_by uuid references public.profiles(id),
  forced boolean not null default false,
  note text
);
create unique index case_closures_one_active
  on public.case_closures(load_out_id, case_id) where reopened_at is null;

create table public.damage_reports (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id),
  load_out_id uuid references public.load_outs(id) on delete set null,
  reported_by uuid not null references public.profiles(id),
  description text not null,
  photo_path text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Helper ─────────────────────────

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active);
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active);
$$;

-- ───────────────────────── Vista stato oggetti ─────────────────────────
-- green: nel case previsto · orange: in un altro case · red: in nessun case

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
    when p.case_id = i.expected_case_id then 'green'
    else 'orange'
  end                  as status
from public.load_outs lo
cross join public.items i
left join public.placements p
  on p.load_out_id = lo.id and p.item_id = i.id and p.removed_at is null
left join public.profiles pr on pr.id = p.placed_by
where i.active;

-- ───────────────────────── RPC ─────────────────────────

-- Mette un oggetto in un case. Se è già in un altro case:
--  - move=false → ritorna conflitto con chi/dove
--  - move=true  → lo sposta (soft-remove del vecchio placement)
create or replace function public.place_item(
  p_load_out uuid, p_item uuid, p_case uuid, p_move boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur record;
begin
  if not is_member() then raise exception 'non autorizzato'; end if;
  if not exists (select 1 from load_outs where id = p_load_out and status = 'open') then
    raise exception 'smontaggio non aperto';
  end if;
  if exists (select 1 from case_closures where load_out_id = p_load_out
             and case_id = p_case and reopened_at is null) then
    return jsonb_build_object('result', 'case_closed');
  end if;

  select p.*, c.code as case_code, pr.display_name as by_name into cur
  from placements p
  join cases c on c.id = p.case_id
  join profiles pr on pr.id = p.placed_by
  where p.load_out_id = p_load_out and p.item_id = p_item and p.removed_at is null
  for update of p;

  if found then
    if cur.case_id = p_case then
      return jsonb_build_object('result', 'already_here');
    end if;
    if not p_move then
      return jsonb_build_object('result', 'conflict',
        'case_code', cur.case_code, 'by', cur.by_name, 'at', cur.placed_at);
    end if;
    update placements set removed_at = now(), removed_by = auth.uid() where id = cur.id;
  end if;

  begin
    insert into placements(load_out_id, item_id, case_id, placed_by)
    values (p_load_out, p_item, p_case, auth.uid());
  exception when unique_violation then
    -- qualcun altro l'ha segnato nello stesso istante
    select c.code as case_code, pr.display_name as by_name, p.placed_at into cur
    from placements p join cases c on c.id = p.case_id join profiles pr on pr.id = p.placed_by
    where p.load_out_id = p_load_out and p.item_id = p_item and p.removed_at is null;
    return jsonb_build_object('result', 'conflict',
      'case_code', cur.case_code, 'by', cur.by_name, 'at', cur.placed_at);
  end;
  return jsonb_build_object('result', 'ok');
end $$;

-- Toglie la spunta (soft delete)
create or replace function public.unplace_item(p_load_out uuid, p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'non autorizzato'; end if;
  update placements set removed_at = now(), removed_by = auth.uid()
  where load_out_id = p_load_out and item_id = p_item and removed_at is null
    and not exists (select 1 from case_closures cc where cc.load_out_id = p_load_out
                    and cc.case_id = placements.case_id and cc.reopened_at is null);
end $$;

-- Chiusura case ("Tutto pronto"), con le regole:
--  rossi presenti      → 'blocked' (solo admin con p_force + nota)
--  solo arancioni      → 'needs_confirm' finché p_confirm=false
--  tutto verde         → 'closed'
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
  where s.load_out_id = p_load_out and s.expected_case_id = p_case and s.status = 'red';

  select coalesce(jsonb_agg(jsonb_build_object('item_id', s.item_id, 'name', s.item_name,
                    'case_code', c.code, 'by', s.placed_by_name)), '[]')
    into elsewhere
  from load_out_item_status s join cases c on c.id = s.actual_case_id
  where s.load_out_id = p_load_out and s.expected_case_id = p_case and s.status = 'orange';

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

create or replace function public.reopen_case(p_load_out uuid, p_case uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'non autorizzato'; end if;
  update case_closures set reopened_at = now(), reopened_by = auth.uid()
  where load_out_id = p_load_out and case_id = p_case and reopened_at is null;
end $$;

-- ───────────────────────── RLS ─────────────────────────

alter table public.profiles           enable row level security;
alter table public.cases              enable row level security;
alter table public.items              enable row level security;
alter table public.shows              enable row level security;
alter table public.load_outs          enable row level security;
alter table public.placements         enable row level security;
alter table public.case_closures      enable row level security;
alter table public.damage_reports     enable row level security;
alter table public.push_subscriptions enable row level security;

-- lettura per tutti i membri attivi
create policy read_profiles   on public.profiles       for select using (is_member());
create policy read_cases      on public.cases          for select using (is_member());
create policy read_items      on public.items          for select using (is_member());
create policy read_shows      on public.shows          for select using (is_member());
create policy read_load_outs  on public.load_outs      for select using (is_member());
create policy read_placements on public.placements     for select using (is_member());
create policy read_closures   on public.case_closures  for select using (is_member());
create policy read_damages    on public.damage_reports for select using (is_member());

-- catalogo, repliche, smontaggi, utenti: solo admin
create policy admin_profiles  on public.profiles  for all using (is_admin()) with check (is_admin());
create policy admin_cases     on public.cases     for all using (is_admin()) with check (is_admin());
create policy admin_items     on public.items     for all using (is_admin()) with check (is_admin());
create policy admin_shows     on public.shows     for all using (is_admin()) with check (is_admin());
create policy admin_load_outs on public.load_outs for all using (is_admin()) with check (is_admin());

-- placements e chiusure: scrittura solo tramite RPC (security definer), nessuna policy di insert diretta

-- danni: tutti segnalano, solo admin risolve
create policy insert_damages on public.damage_reports for insert
  with check (is_member() and reported_by = auth.uid());
create policy admin_damages on public.damage_reports for update using (is_admin()) with check (is_admin());

-- notifiche: ognuno gestisce le proprie iscrizioni
create policy own_push on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── Realtime ─────────────────────────
alter publication supabase_realtime add table public.placements, public.case_closures;

-- ───────────────────────── Storage ─────────────────────────
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict do nothing;

create policy photos_read on storage.objects for select
  using (bucket_id = 'photos' and public.is_member());
create policy photos_write on storage.objects for insert
  with check (bucket_id = 'photos' and public.is_member());

-- Riassegnazione definitiva di un oggetto a un altro case (solo admin).
-- pending = "da spostare fisicamente alla prossima replica"; done = "è già lì".
-- In entrambi i casi il case previsto cambia subito: dal prossimo smontaggio l'oggetto va nel nuovo case.

create table public.item_moves (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  from_case_id uuid references public.cases(id) on delete set null,
  to_case_id uuid not null references public.cases(id),
  status text not null check (status in ('pending', 'done')),
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id)
);
create index item_moves_pending on public.item_moves(item_id) where status = 'pending';

alter table public.item_moves enable row level security;
create policy read_moves on public.item_moves for select using (is_member());

create or replace function public.move_item(
  p_item uuid, p_to_case uuid, p_pending boolean, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_from uuid;
begin
  if not is_admin() then raise exception 'solo admin'; end if;
  select expected_case_id into v_from from items where id = p_item for update;
  if v_from is not distinct from p_to_case then return; end if;
  -- uno spostamento pendente precedente viene superato da questo
  update item_moves set status = 'done', completed_at = now(), completed_by = auth.uid()
  where item_id = p_item and status = 'pending';
  insert into item_moves(item_id, from_case_id, to_case_id, status, note, created_by, completed_at, completed_by)
  values (p_item, v_from, p_to_case, case when p_pending then 'pending' else 'done' end, p_note, auth.uid(),
          case when p_pending then null else now() end, case when p_pending then null else auth.uid() end);
  update items set expected_case_id = p_to_case where id = p_item;
end $$;

create or replace function public.complete_move(p_move uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'non autorizzato'; end if;
  update item_moves set status = 'done', completed_at = now(), completed_by = auth.uid()
  where id = p_move and status = 'pending';
end $$;

-- Quando un oggetto con spostamento pendente viene messo nel nuovo case, lo spostamento è fatto.
create or replace function public.trg_complete_move_on_place()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update item_moves set status = 'done', completed_at = now(), completed_by = new.placed_by
  where item_id = new.item_id and status = 'pending' and to_case_id = new.case_id;
  return new;
end $$;

create trigger complete_move_on_place after insert on public.placements
for each row execute function public.trg_complete_move_on_place();

alter publication supabase_realtime add table public.item_moves;

-- ───── Catalogo di prova: 10 case, 100 oggetti (gli stessi della demo) ─────
insert into public.cases (code, name, color, notes, sort_order) values
  ('01', 'Audio', '#0BB9EA', 'Mixer sempre in alto, imbottitura blu sotto.', 1),
  ('02', 'Luci', '#F5C542', 'Teste mobili nelle sagome, barre LED sul fondo.', 2),
  ('03', 'Microfoni', '#B583FF', 'Ogni radiomicrofono nella sua sagoma numerata.', 3),
  ('04', 'Strumenti', '#FF7A45', 'Chitarre in verticale, sax nella sua custodia.', 4),
  ('05', 'Magia', '#FF3B6B', 'Il baule dei trucchi: NON aprire davanti al pubblico.', 5),
  ('06', 'Scenografia', '#E23A3A', 'Pannelli in fondo, piedini avvitati a parte.', 6),
  ('07', 'Costumi', '#E86BD8', 'Giacca rossa sempre appesa nella sacca, mai piegata.', 7),
  ('08', 'Video', '#4ADE80', 'Proiettore al centro, ottica smontata.', 8),
  ('09', 'Cavi e corrente', '#94A3B8', 'Cavi arrotolati over-under, fascette in velcro.', 9),
  ('10', 'Attrezzeria', '#38BDF8', 'Tutto quello che non sta altrove.', 10)
on conflict (code) do nothing;

insert into public.items (name, aliases, expected_case_id)
select v.name, v.aliases, c.id from (values
  ('Mixer digitale', array['banco', 'console audio', 'mixer']::text[], '01'),
  ('Stagebox 16 canali', array['stagebox', 'ciabatta audio']::text[], '01'),
  ('Cuffie regia', array['cuffie', 'cuffia grande']::text[], '01'),
  ('Interfaccia audio USB', array[]::text[], '01'),
  ('Casse monitor (coppia)', array['spie', 'monitor']::text[], '01'),
  ('Splitter DI x4', array[]::text[], '01'),
  ('Alimentatore mixer', array[]::text[], '01'),
  ('Router Wi-Fi regia', array[]::text[], '01'),
  ('Tablet regia audio', array['ipad audio', 'tablet']::text[], '01'),
  ('Custodia chiavette USB', array[]::text[], '01'),
  ('Testa mobile SX', array['testa 1', 'moving sinistra']::text[], '02'),
  ('Testa mobile DX', array['testa 2', 'moving destra']::text[], '02'),
  ('Barra LED 1', array['barra 1']::text[], '02'),
  ('Barra LED 2', array['barra 2']::text[], '02'),
  ('Macchina del fumo', array[]::text[], '02'),
  ('Liquido fumo (tanica)', array[]::text[], '02'),
  ('Controller DMX', array[]::text[], '02'),
  ('Seguipersona piccolo', array['occhio di bue', 'follow spot']::text[], '02'),
  ('Gelatine colorate', array[]::text[], '02'),
  ('Ganci e sicure', array[]::text[], '02'),
  ('Radiomicrofono archetto 1', array['archetto leo', 'headset 1']::text[], '03'),
  ('Radiomicrofono archetto 2', array['archetto 2', 'headset 2']::text[], '03'),
  ('Microfono gelato', array['gelato', 'shure']::text[], '03'),
  ('Microfono vintage', array['microfono anni 50', 'retrò']::text[], '03'),
  ('Ricevitore radiomicrofoni', array[]::text[], '03'),
  ('Asta microfono', array[]::text[], '03'),
  ('Pinze microfono', array[]::text[], '03'),
  ('Batterie AA (scatola)', array[]::text[], '03'),
  ('Antenne ricevitore', array[]::text[], '03'),
  ('Spugnette antivento', array[]::text[], '03'),
  ('Chitarra acustica', array['chitarra', 'acustica']::text[], '04'),
  ('Sassofono contralto', array['sax']::text[], '04'),
  ('Ukulele', array[]::text[], '04'),
  ('Tastiera 61 tasti', array['tastiera', 'piano']::text[], '04'),
  ('Supporto tastiera', array[]::text[], '04'),
  ('Leggio', array[]::text[], '04'),
  ('Capotasto e plettri', array[]::text[], '04'),
  ('Cavo jack chitarra', array[]::text[], '04'),
  ('Accordatore', array[]::text[], '04'),
  ('Ance sax (astuccio)', array[]::text[], '04'),
  ('Scatola rossa', array['scatola magica', 'box rosso', 'cassetta rossa']::text[], '05'),
  ('Mazzo carte truccato', array['carte', 'mazzo leo']::text[], '05'),
  ('Cilindro', array['cappello', 'tuba']::text[], '05'),
  ('Bacchetta magica', array[]::text[], '05'),
  ('Anelli cinesi', array['anelli']::text[], '05'),
  ('Foulard colorati', array[]::text[], '05'),
  ('Palloncini blu (busta)', array['palloncini', 'balloon']::text[], '05'),
  ('Corda tagliata e ricomposta', array[]::text[], '05'),
  ('Bicchieri e palline', array[]::text[], '05'),
  ('Busta delle previsioni', array[]::text[], '05'),
  ('Pannello fondale 1', array['fondale 1']::text[], '06'),
  ('Pannello fondale 2', array['fondale 2']::text[], '06'),
  ('Piedini pannelli (sacca)', array[]::text[], '06'),
  ('Sipario rosso piccolo', array['tendina', 'sipario']::text[], '06'),
  ('Sgabello alto', array[]::text[], '06'),
  ('Tavolino magia', array[]::text[], '06'),
  ('Tappeto scena', array[]::text[], '06'),
  ('Appendiabiti scena', array[]::text[], '06'),
  ('Cornice vuota', array[]::text[], '06'),
  ('Insegna luminosa NSS', array[]::text[], '06'),
  ('Giacca rossa', array['giacca leo', 'giacca di scena']::text[], '07'),
  ('Camicia nera', array[]::text[], '07'),
  ('Pantaloni neri', array[]::text[], '07'),
  ('Papillon', array[]::text[], '07'),
  ('Scarpe di scena', array[]::text[], '07'),
  ('Cappotto lungo', array[]::text[], '07'),
  ('Kit trucco', array[]::text[], '07'),
  ('Spazzola vestiti', array[]::text[], '07'),
  ('Ferro da stiro da viaggio', array[]::text[], '07'),
  ('Grucce (6)', array[]::text[], '07'),
  ('Proiettore', array['videoproiettore', 'proiettore']::text[], '08'),
  ('Ottica proiettore', array[]::text[], '08'),
  ('Videocamera', array['camera', 'telecamera']::text[], '08'),
  ('Treppiede', array[]::text[], '08'),
  ('Laptop video', array['computer video', 'mac video']::text[], '08'),
  ('Telecomando slide', array[]::text[], '08'),
  ('Cavo HDMI 15m', array[]::text[], '08'),
  ('Convertitore HDMI-SDI', array[]::text[], '08'),
  ('Monitor di servizio', array[]::text[], '08'),
  ('Hard disk backup', array[]::text[], '08'),
  ('Prolunga 25m', array['prolunga lunga', 'rullo']::text[], '09'),
  ('Prolunga 10m', array[]::text[], '09'),
  ('Ciabatte (x4)', array[]::text[], '09'),
  ('Cavi XLR (sacca)', array[]::text[], '09'),
  ('Cavi DMX (sacca)', array[]::text[], '09'),
  ('Cavi powercon', array[]::text[], '09'),
  ('Multipresa con interruttore', array[]::text[], '09'),
  ('Adattatori Schuko', array[]::text[], '09'),
  ('Nastro gaffer', array[]::text[], '09'),
  ('Fascette velcro', array[]::text[], '09'),
  ('Cassetta attrezzi', array['attrezzi', 'box attrezzi']::text[], '10'),
  ('Smartphone di scena', array['telefono', 'cellulare']::text[], '10'),
  ('Torcia frontale', array[]::text[], '10'),
  ('Forbici', array[]::text[], '10'),
  ('Pennarelli e scotch carta', array[]::text[], '10'),
  ('Kit pronto soccorso', array[]::text[], '10'),
  ('Scaletta cartacea', array[]::text[], '10'),
  ('Walkie-talkie (x3)', array[]::text[], '10'),
  ('Asciugamani', array[]::text[], '10'),
  ('Bottiglie acqua', array[]::text[], '10')
) as v(name, aliases, code)
join public.cases c on c.code = v.code
where not exists (select 1 from public.items i where i.name = v.name);
