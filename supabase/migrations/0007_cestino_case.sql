-- ═══════════════════════════════════════════════════════════════
-- 0007 · Cestino dei case (solo admin)
-- Un case va nel cestino solo se è VUOTO (nessun oggetto assegnato, scatole comprese).
-- Nel cestino sparisce da home, catalogo e smontaggi; si può RIPRISTINARE. Non si elimina per sempre:
-- lo storico degli smontaggi passati deve restare leggibile.
-- Solo AGGIUNTE: nessun dato esistente cambia. Rilanciabile.
-- ═══════════════════════════════════════════════════════════════

alter table public.cases add column if not exists deleted_at timestamptz;
alter table public.cases add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

create or replace function public.trash_case(p_case uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n int; v_code text; v_name text;
begin
  if not is_admin() then raise exception 'Solo un admin può eliminare i case'; end if;
  select code, name into v_code, v_name from cases where id = p_case and active;
  if not found then raise exception 'Case non trovato o già nel cestino'; end if;
  n := (select count(*) from items where expected_case_id = p_case and active);
  if n > 0 then
    raise exception 'Il case % contiene ancora % oggetti: spostali in un altro case prima di eliminarlo', v_code, n;
  end if;
  if exists (select 1 from case_closures cc join load_outs lo on lo.id = cc.load_out_id
             where cc.case_id = p_case and lo.status = 'open' and cc.reopened_at is null)
     or exists (select 1 from placements p join load_outs lo on lo.id = p.load_out_id
                where p.case_id = p_case and lo.status = 'open' and p.removed_at is null) then
    raise exception 'Il case % è in uso nello smontaggio in corso: riprova quando è concluso', v_code;
  end if;
  update cases set active = false, deleted_at = now(), deleted_by = auth.uid() where id = p_case;
  perform log_event('case_trashed', auth.uid(), 'ha spostato nel cestino il case ' || v_code || ' «' || v_name || '»', null, null, p_case);
end $$;

create or replace function public.restore_case(p_case uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text; v_name text;
begin
  if not is_admin() then raise exception 'Solo un admin può ripristinare i case'; end if;
  update cases set active = true, deleted_at = null, deleted_by = null where id = p_case and not active
  returning code, name into v_code, v_name;
  if not found then raise exception 'Case non trovato nel cestino'; end if;
  perform log_event('case_restored', auth.uid(), 'ha ripristinato il case ' || v_code || ' «' || v_name || '»', null, null, p_case);
end $$;

-- Un oggetto non si ripristina dentro un case che è nel cestino.
create or replace function public.restore_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo un admin può ripristinare oggetti'; end if;
  if exists (select 1 from items i join cases c on c.id = i.expected_case_id where i.id = p_item and not c.active) then
    raise exception 'Il suo case è nel cestino: ripristina prima il case';
  end if;
  update items set active = true, deleted_at = null, deleted_by = null where id = p_item and not active;
  if not found then raise exception 'Oggetto non trovato nel cestino'; end if;
  perform log_event('item_restored', auth.uid(),
    'ha ripristinato ' || item_label(p_item) || ' nel ' || case_label((select expected_case_id from items where id = p_item)),
    null, p_item, null);
end $$;

-- Nessun oggetto può essere assegnato a un case nel cestino.
create or replace function public.trg_items_case_active()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active and new.expected_case_id is not null
     and (tg_op = 'INSERT' or new.expected_case_id is distinct from old.expected_case_id or not old.active)
     and exists (select 1 from cases where id = new.expected_case_id and not active) then
    raise exception 'Quel case è nel cestino: ripristinalo prima';
  end if;
  return new;
end $$;
drop trigger if exists items_case_active on public.items;
create trigger items_case_active before insert or update on public.items
for each row execute function public.trg_items_case_active();

-- Registro: niente righe doppie "ha modificato il case" per cestino/ripristino.
create or replace function public.trg_log_catalog()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'cases' then
    -- cestino/ripristino li registrano le funzioni apposite: qui solo creazione e modifiche vere
    if tg_op = 'INSERT' or (old.code, old.name, old.color, old.notes, old.photo_path, old.layout_photo_path, old.layout_photos, old.sort_order)
         is distinct from (new.code, new.name, new.color, new.notes, new.photo_path, new.layout_photo_path, new.layout_photos, new.sort_order) then
      perform log_event(case when tg_op = 'INSERT' then 'case_created' else 'case_updated' end, auth.uid(),
        case when tg_op = 'INSERT' then 'ha creato il ' else 'ha modificato il ' end || 'case ' || new.code || ' «' || new.name || '»',
        null, null, new.id);
    end if;
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
