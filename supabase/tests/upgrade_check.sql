\set ON_ERROR_STOP on
set role authenticated;
select t.as_user('leonardo');
do $t$
begin
  perform t.ok(exists (select 1 from public.activity_log where message = 'Matteo ha messo «Scatola rossa» nel case 08 (dovrebbe stare nel case 05)'),
    'storico ricostruito: la Scatola rossa nel case sbagliato');
  perform t.ok(exists (select 1 from public.activity_log where message = 'Matteo ha tolto «Cuffie regia» dal case 01'), 'storico ricostruito: spunta tolta');
  perform t.ok((select count(*) from public.activity_log where action = 'load_out_started') = 1, 'storico ricostruito una volta sola (migration rilanciata 2 volte)');
  perform t.ok(exists (select 1 from public.load_out_issues where item_id = t.iid('Scatola rossa') and kind = 'misplaced'),
    'lo smontaggio già concluso ha le sue voci: Scatola rossa nel case sbagliato');
  perform t.ok((select count(*) from public.load_out_issues where kind = 'missing') = 98, 'e i 98 oggetti mai segnati');
  perform t.ok(t.fails($$update public.load_outs set status = 'open'$$) or not exists (select 1 from public.load_outs where status = 'open'),
    'dopo la 0003 lo smontaggio non si chiude più direttamente dalla tabella');
end $t$;
reset role;
select 'AGGIORNAMENTO OK' as esito;
