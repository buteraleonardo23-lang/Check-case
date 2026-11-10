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
