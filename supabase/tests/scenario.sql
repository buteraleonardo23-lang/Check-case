-- ═══════════════════════════════════════════════════════════════
-- Scenario completo di smontaggio, eseguito come utenti veri (ruolo authenticated + RLS).
-- Ogni controllo stampa "ok …"; al primo errore lo script si ferma con "TEST FALLITO".
-- ═══════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
set role authenticated;

-- 1. Avvio smontaggio
select t.as_user('diego');
select t.ok(t.fails($$insert into public.load_outs(created_by) values (t.uid('diego'))$$), 'un operatore non può iniziare lo smontaggio');
select t.as_user('leonardo');
insert into public.load_outs(created_by) values (t.uid('leonardo'));
select t.ok(t.lo() is not null, 'Leonardo inizia lo smontaggio');

-- 2. Carico: casi normali, case sbagliato, conflitto, spunta tolta
do $t$
declare r jsonb; n int;
begin
  perform t.as_user('diego');
  r := public.place_item(t.lo(), t.iid('Mixer digitale'), t.cid('01'));
  perform t.ok(r->>'result' = 'ok', 'Diego mette il Mixer nel case 01');

  perform t.as_user('matteo');
  r := public.place_item(t.lo(), t.iid('Scatola rossa'), t.cid('08'));
  perform t.ok(r->>'result' = 'ok', 'Matteo mette la Scatola rossa nel case 08 (sbagliato)');
  perform t.ok((select status from public.load_out_item_status where load_out_id = t.lo() and item_id = t.iid('Scatola rossa')) = 'orange',
    'la Scatola rossa risulta ARANCIONE');

  perform t.as_user('diego');
  r := public.place_item(t.lo(), t.iid('Scatola rossa'), t.cid('05'));
  perform t.ok(r->>'result' = 'conflict' and r->>'case_code' = '08' and r->>'by' = 'Matteo',
    'Diego prova a segnarla nel 05: avviso "già nel case 08 da Matteo"');

  r := public.place_item(t.lo(), t.iid('Microfono vintage'), t.cid('04'));
  perform t.ok(r->>'result' = 'ok', 'Diego mette il Microfono vintage tra gli strumenti (case 04)');

  r := public.place_item(t.lo(), t.iid('Cuffie regia'), t.cid('01'));
  perform public.unplace_item(t.lo(), t.iid('Cuffie regia'));
  perform t.ok((select status from public.load_out_item_status where load_out_id = t.lo() and item_id = t.iid('Cuffie regia')) = 'red',
    'Diego segna e poi toglie le Cuffie: tornano ROSSE');

  -- riempie il case 01 tranne le cuffie
  for n in 1..1 loop
    perform public.place_item(t.lo(), i.id, t.cid('01')) from public.items i
    where i.expected_case_id = t.cid('01') and i.name not in ('Mixer digitale', 'Cuffie regia');
  end loop;
  perform t.ok((select count(*) from public.load_out_item_status where load_out_id = t.lo() and expected_case_id = t.cid('01') and status = 'green') = 9,
    'case 01: 9 oggetti su 10 dentro');
end $t$;

-- 3. Chiusura case: bloccata, forzatura negata all'operatore, forzata dall'admin, riapertura
do $t$
declare r jsonb;
begin
  perform t.as_user('diego');
  r := public.close_case(t.lo(), t.cid('01'));
  perform t.ok(r->>'result' = 'blocked' and r->'missing'->0->>'name' = 'Cuffie regia', 'case 01 BLOCCATO: manca "Cuffie regia"');
  r := public.close_case(t.lo(), t.cid('01'), true, true, 'ci provo');
  perform t.ok(r->>'result' = 'blocked', 'un operatore non può forzare la chiusura');

  perform t.as_user('leonardo');
  r := public.close_case(t.lo(), t.cid('01'), true, true, '');
  perform t.ok(r->>'result' = 'blocked', 'l''admin non può forzare senza nota');
  r := public.close_case(t.lo(), t.cid('01'), true, true, 'cuffie rimaste in regia');
  perform t.ok(r->>'result' = 'closed', 'Leonardo FORZA la chiusura del case 01 con nota');

  perform t.as_user('diego');
  r := public.place_item(t.lo(), t.iid('Cuffie regia'), t.cid('01'));
  perform t.ok(r->>'result' = 'case_closed', 'non si aggiunge niente a un case chiuso');
  perform public.reopen_case(t.lo(), t.cid('01'));
  r := public.place_item(t.lo(), t.iid('Cuffie regia'), t.cid('01'));
  perform t.ok(r->>'result' = 'ok', 'Diego riapre il 01 e mette le Cuffie');
  r := public.close_case(t.lo(), t.cid('01'));
  perform t.ok(r->>'result' = 'closed', 'case 01 chiuso normalmente, tutto verde');
end $t$;

-- 4. Case con oggetto altrove: conferma richiesta
do $t$
declare r jsonb;
begin
  perform t.as_user('diego');
  perform public.place_item(t.lo(), i.id, t.cid('03')) from public.items i
  where i.expected_case_id = t.cid('03') and i.name <> 'Microfono vintage';
  r := public.close_case(t.lo(), t.cid('03'));
  perform t.ok(r->>'result' = 'needs_confirm' and r->'elsewhere'->0->>'case_code' = '04',
    'case 03: chiede conferma perché il Microfono vintage è nel 04');
  r := public.close_case(t.lo(), t.cid('03'), true);
  perform t.ok(r->>'result' = 'closed', 'case 03 chiuso dopo conferma');
end $t$;

-- 5. Riepilogo e chiusura smontaggio
do $t$
declare r jsonb; n_missing int;
begin
  perform t.as_user('diego');
  perform t.ok(t.fails($$select public.end_load_out(t.lo(), true)$$), 'un operatore non può concludere lo smontaggio');
  perform t.ok(t.fails($$update public.load_outs set status = 'closed'$$) or (select status from public.load_outs where id = t.lo()) = 'open',
    'un operatore non può chiudere lo smontaggio dalla tabella');

  perform t.as_user('leonardo');
  r := public.end_load_out(t.lo(), false);
  perform t.ok(r->>'result' = 'needs_confirm', 'Leonardo chiede di concludere: prima vede il riepilogo');
  perform t.ok(jsonb_array_length(r->'summary'->'misplaced') = 2, 'riepilogo: 2 oggetti nel case sbagliato');
  n_missing := (select count(*) from public.load_out_item_status where load_out_id = t.lo() and status = 'red');
  perform t.ok(jsonb_array_length(r->'summary'->'missing') = n_missing and n_missing = 100 - 21,
    format('riepilogo: %s oggetti non trovati', n_missing));
  perform t.ok(r->'summary'->'open_cases' @> '["05"]' and not (r->'summary'->'open_cases' @> '["01"]'),
    'riepilogo: elenca i case ancora aperti (05 sì, 01 no)');

  r := public.end_load_out((select id from public.load_outs where status = 'open'), true);
  perform t.ok(r->>'result' = 'closed', 'Leonardo conferma: smontaggio concluso');
  perform t.ok((select count(*) from public.load_out_issues where kind = 'misplaced') = 2
           and (select count(*) from public.load_out_issues where kind = 'missing') = n_missing,
    'creati i "Da sistemare": 2 nel case sbagliato + tutti i non trovati');
  perform t.ok(exists (select 1 from public.load_out_issues where item_id = t.iid('Scatola rossa') and kind = 'misplaced'
                and actual_case_id = t.cid('08') and placed_by = t.uid('matteo')),
    'la voce ricorda: Scatola rossa nel 08, messa da Matteo');
end $t$;

-- 6. Registro attività
do $t$
begin
  perform t.as_user('diego');
  perform t.ok((select count(*) from public.activity_log) = 0, 'un operatore NON vede il registro');
  perform t.as_user('leonardo');
  perform t.ok(exists (select 1 from public.activity_log where message = 'Matteo ha messo «Scatola rossa» nel case 08 (dovrebbe stare nel case 05)'),
    'registro: "Matteo ha messo «Scatola rossa» nel case 08 (dovrebbe stare nel case 05)"');
  perform t.ok(exists (select 1 from public.activity_log where message = 'Diego ha tolto «Cuffie regia» dal case 01'), 'registro: spunta tolta');
  perform t.ok(exists (select 1 from public.activity_log where action = 'case_forced' and message like 'Leonardo ha FORZATO la chiusura del case 01 (nota: cuffie rimaste in regia)'),
    'registro: chiusura forzata con nota');
  perform t.ok(exists (select 1 from public.activity_log where action = 'case_reopened' and actor_name = 'Diego'), 'registro: riapertura');
  perform t.ok((select count(*) from public.activity_log where action in ('placed', 'placed_elsewhere'))
             = (select count(*) from public.placements), 'registro: ogni oggetto messo ha la sua riga');
  perform t.ok(exists (select 1 from public.activity_log where action = 'load_out_ended' and actor_name = 'Leonardo')
           and exists (select 1 from public.activity_log where action = 'load_out_summary'), 'registro: conclusione e riepilogo confermato');
end $t$;

-- 7. Risoluzione manuale
do $t$
declare v uuid;
begin
  perform t.as_user('diego');
  v := (select id from public.load_out_issues where item_id = t.iid('Ukulele'));
  perform t.ok(t.fails(format('select public.resolve_issue(%L, %L)', v, 'found')), 'un operatore non può risolvere le voci');

  perform t.as_user('leonardo');
  perform public.resolve_issue(v, 'lost', 'cercato ovunque');
  perform t.ok((select status from public.load_out_issues where id = v) = 'lost', 'Ukulele confermato PERSO (resta in lista: da ricomprare)');
  perform public.resolve_issue(v, 'replaced');
  perform t.ok((select status = 'resolved' and resolution = 'replaced' from public.load_out_issues where id = v), 'Ukulele ricomprato: voce chiusa');

  v := (select id from public.load_out_issues where item_id = t.iid('Microfono vintage'));
  perform public.resolve_issue(v, 'reassigned');
  perform t.ok((select expected_case_id from public.items where id = t.iid('Microfono vintage')) = t.cid('04'),
    '"Lascialo lì": il Microfono vintage ora va nel case 04');
  perform t.ok((select status from public.load_out_issues where id = v) = 'resolved', 'voce del Microfono vintage chiusa');
  perform t.ok(exists (select 1 from public.item_moves where item_id = t.iid('Microfono vintage') and status = 'done'),
    'resta traccia dello spostamento definitivo');
end $t$;

-- 8. Smontaggio successivo: le voci si chiudono da sole quando le cose tornano a posto
reset role;
set role authenticated;
select t.as_user('leonardo');
insert into public.load_outs(created_by) values (t.uid('leonardo'));
do $t$
declare r jsonb;
begin
  perform t.as_user('diego');
  r := public.place_item(t.lo(), t.iid('Scatola rossa'), t.cid('05'));
  perform t.ok((select status = 'resolved' and resolution = 'fixed' from public.load_out_issues where item_id = t.iid('Scatola rossa')),
    'smontaggio dopo: Scatola rossa messa nel 05 → voce chiusa da sola ("rimessa a posto")');
  r := public.place_item(t.lo(), t.iid('Cilindro'), t.cid('02'));
  perform t.ok((select status = 'resolved' and resolution = 'found' from public.load_out_issues where item_id = t.iid('Cilindro')),
    'smontaggio dopo: il Cilindro (non trovato la volta prima) ricompare → voce "ritrovato"');
  perform t.ok((select count(*) from public.load_out_issues where status = 'open') = (select count(*) from public.load_out_issues) - 4,
    'le altre voci restano aperte');
end $t$;

-- 9. Ignora in blocco (dopo uno smontaggio di prova)
do $t$
declare n int;
begin
  perform t.as_user('leonardo');
  n := public.resolve_issues(array(select id from public.load_out_issues where kind = 'missing' and status = 'open'), 'dismissed', 'smontaggio di prova');
  perform t.ok(n > 70 and not exists (select 1 from public.load_out_issues where kind = 'missing' and status = 'open'),
    format('"Ignora tutti": %s voci chiuse insieme', n));
end $t$;

reset role;
select 'TUTTI I TEST SUPERATI' as esito;
