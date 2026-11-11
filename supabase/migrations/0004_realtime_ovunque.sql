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
