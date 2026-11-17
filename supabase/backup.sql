-- ═══════════════════════════════════════════════════════════════
-- Check-case · COPIA DI SICUREZZA (lanciala PRIMA di ogni aggiornamento)
-- Copia tutte le tabelle dell'app in uno schema "backup_AAAAMMGG_HHMM" dentro lo stesso database.
-- Non modifica niente. Lo schema di backup non è raggiungibile dall'app né da internet.
-- ═══════════════════════════════════════════════════════════════
do $$
declare
  s text := 'backup_' || to_char(now() at time zone 'Europe/Rome', 'YYYYMMDD_HH24MI');
  t text;
begin
  execute format('create schema if not exists %I', s);
  foreach t in array array['profiles', 'cases', 'items', 'shows', 'load_outs', 'placements', 'case_closures',
                           'damage_reports', 'item_moves', 'activity_log', 'load_out_issues', 'item_checkouts'] loop
    if to_regclass('public.' || t) is not null and to_regclass(s || '.' || t) is null then
      execute format('create table %I.%I as table public.%I', s, t, t);
    end if;
  end loop;
  raise notice 'Copia salvata in %', s;
end $$;

-- Controllo: quante righe sono state copiate (devono essere uguali a quelle dell'app)
select table_schema as copia, table_name as tabella,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int as righe
from information_schema.tables
where table_schema = (select max(schema_name) from information_schema.schemata where schema_name like 'backup\_%')
order by table_name;
