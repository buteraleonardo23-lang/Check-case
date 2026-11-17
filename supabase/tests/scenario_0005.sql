-- ═══════════════════════════════════════════════════════════════
-- Scenario 0005: smontaggio di prova, "Ho un altro evento", elimina oggetto, foto multiple.
-- Gira dopo scenario.sql (c'è uno smontaggio vero aperto e delle voci "da sistemare").
-- ═══════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
set role authenticated;

-- 10. Chiudo lo smontaggio vero aperto, decido uno spostamento, prendo il sax per un evento
do $t$
declare r jsonb;
begin
  perform t.as_user('leonardo');
  perform public.end_load_out(t.lo(), true);
  perform public.move_item(t.iid('Torcia frontale'), t.cid('09'), true, 'prova');
  perform t.as_user('diego');
  perform t.ok(t.fails($$select public.checkout_item(t.iid('Sassofono contralto'), null, 'Festa')$$), 'un operatore non può segnare oggetti presi per un evento');
  perform t.as_user('leonardo');
  r := public.checkout_item(t.iid('Sassofono contralto'), null, 'Festa privata');
  perform t.ok(r->>'result' = 'ok', 'Leonardo segna: preso il Sassofono per «Festa privata»');
  perform t.ok((select from_case_id from public.item_checkouts where item_id = t.iid('Sassofono contralto')) = t.cid('04'),
    'il case di provenienza è quello dove va (04)');
  r := public.checkout_item(t.iid('Sassofono contralto'), null, 'Festa privata');
  perform t.ok(r->>'result' = 'already_out', 'non si segna due volte lo stesso oggetto fuori');
  perform t.ok(exists (select 1 from public.activity_log where message = 'Leonardo ha preso «Sassofono contralto» dal case 04 per «Festa privata»'),
    'registro: "Leonardo ha preso «Sassofono contralto» dal case 04 per «Festa privata»"');
end $t$;

-- 11. Smontaggio di PROVA: si usa tutto, poi si butta via senza toccare i dati veri
select t.as_user('leonardo');
insert into public.load_outs(created_by, is_test) values (t.uid('leonardo'), true);
do $t$
declare r jsonb; open_before int; v_lo uuid := t.lo();
begin
  open_before := (select count(*) from public.load_out_issues where status <> 'resolved');
  perform t.as_user('diego');
  r := public.place_item(v_lo, t.iid('Gelatine colorate'), t.cid('02'));        -- era "non trovato"
  r := public.place_item(v_lo, t.iid('Torcia frontale'), t.cid('09'));          -- spostamento deciso
  r := public.place_item(v_lo, t.iid('Sassofono contralto'), t.cid('04'));      -- era fuori per l'evento
  r := public.close_case(v_lo, t.cid('09'), true);
  perform t.ok((select count(*) from public.load_out_issues where status <> 'resolved') = open_before,
    'in prova le voci "da sistemare" NON si chiudono da sole');
  perform t.ok((select status from public.item_moves where item_id = t.iid('Torcia frontale') and note = 'prova') = 'pending',
    'in prova lo spostamento deciso resta da fare');
  perform t.ok(exists (select 1 from public.item_checkouts where item_id = t.iid('Sassofono contralto') and returned_at is null),
    'in prova il Sassofono resta "fuori per l''evento"');

  perform t.as_user('leonardo');
  perform t.ok(t.fails(format('select public.end_load_out(%L, true)', v_lo)), 'una prova non si conclude col riepilogo');
  perform t.as_user('diego');
  perform t.ok(t.fails(format('select public.discard_test_load_out(%L)', v_lo)), 'un operatore non può chiudere la prova');
  perform t.as_user('leonardo');
  perform public.discard_test_load_out(v_lo);
  perform t.ok(not exists (select 1 from public.load_outs where id = v_lo), 'prova chiusa: lo smontaggio di prova non esiste più');
  perform t.ok(not exists (select 1 from public.placements where load_out_id = v_lo)
           and not exists (select 1 from public.case_closures where load_out_id = v_lo), 'oggetti segnati e case chiusi in prova: cancellati');
  perform t.ok(not exists (select 1 from public.activity_log where load_out_id = v_lo), 'registro della prova: cancellato');
  perform t.ok(exists (select 1 from public.activity_log where action = 'test_discarded' and message like 'Leonardo ha fatto uno smontaggio di prova%'),
    'resta una sola riga: "Leonardo ha fatto uno smontaggio di prova"');
  perform t.ok(t.fails($$select public.discard_test_load_out((select id from public.load_outs order by started_at desc limit 1))$$),
    'non si può "scartare" uno smontaggio vero');
end $t$;

-- 12. Smontaggio vero: il sax fuori per l'evento non risulta "non trovato"; rimesso nel case → rientrato da solo
select t.as_user('leonardo');
insert into public.load_outs(created_by) values (t.uid('leonardo'));
do $t$
declare s jsonb; n_issues int;
begin
  perform t.as_user('leonardo');
  perform public.checkout_item(t.iid('Cilindro'), null, null);
  s := public.load_out_summary(t.lo());
  perform t.ok(s->'checked_out' @> '[{"name": "Sassofono contralto", "event": "Festa privata"}]'
           and not (s->'missing' @> '[{"name": "Sassofono contralto"}]'),
    'riepilogo: il Sassofono è "fuori per un evento", non "non trovato"');
  perform t.as_user('diego');
  perform public.place_item(t.lo(), t.iid('Sassofono contralto'), t.cid('04'));
  perform t.ok((select returned_at is not null from public.item_checkouts where item_id = t.iid('Sassofono contralto')),
    'Diego mette il Sassofono nel 04: risulta rientrato da solo');
  perform t.as_user('leonardo');
  perform public.end_load_out(t.lo(), true);
  perform t.ok(not exists (select 1 from public.load_out_issues where item_id = t.iid('Cilindro') and load_out_id =
    (select id from public.load_outs order by started_at desc limit 1)), 'il Cilindro fuori per un evento non diventa "non trovato"');
  perform t.ok(public.return_checkouts(array(select id from public.item_checkouts where returned_at is null), 'evento finito') = 1,
    '"Tutto rimesso": il Cilindro rientra');
  perform t.ok(exists (select 1 from public.activity_log where message = 'Leonardo ha rimesso «Cilindro» nel case 05 (evento finito)'),
    'registro: "Leonardo ha rimesso «Cilindro» nel case 05"');
end $t$;

-- 13. Cestino: elimina → ripristina → elimina per sempre; foto multiple
do $t$
declare v uuid := t.iid('Mixer digitale'); n_hist int; n int;
begin
  n_hist := (select count(*) from public.placements where item_id = v);
  perform t.as_user('diego');
  perform t.ok(t.fails(format('select public.trash_item(%L)', v)), 'un operatore non può eliminare oggetti');
  perform t.as_user('leonardo');
  perform t.ok(t.fails(format('select public.delete_item(%L)', v)), '"Elimina per sempre" funziona solo su oggetti nel cestino');
  perform public.trash_item(v);
  perform t.ok(not exists (select 1 from public.load_out_item_status where item_id = v), 'nel cestino: sparisce dagli smontaggi');
  perform t.ok((select count(*) from public.placements where item_id = v) = n_hist and n_hist > 0, 'nel cestino: lo storico resta tutto');
  perform public.restore_item(v);
  perform t.ok((select active from public.items where id = v) and exists (select 1 from public.load_out_item_status where item_id = v),
    'ripristinato: torna nel suo case con lo storico');
  perform t.ok(exists (select 1 from public.activity_log where message = 'Leonardo ha spostato nel cestino «Mixer digitale» (era nel case 01)')
           and exists (select 1 from public.activity_log where message = 'Leonardo ha ripristinato «Mixer digitale» nel case 01'),
    'registro: cestino e ripristino');
  perform t.ok(not exists (select 1 from public.activity_log where action = 'item_updated' and item_id = v),
    'registro: nessuna riga doppia "ha modificato"');
  perform public.trash_item(v);
  perform public.trash_item(t.iid('Leggio'));
  perform t.ok(public.empty_trash() = 2, '"Svuota cestino": eliminati per sempre 2 oggetti');
  perform t.ok(not exists (select 1 from public.items where not active), 'cestino vuoto');
  perform t.ok(exists (select 1 from public.activity_log where message = 'Leonardo ha eliminato per sempre l''oggetto «Mixer digitale» (era nel case 01)'),
    'registro: eliminazione definitiva');
  update public.cases set layout_photos = layout_photos || 'foto-2.jpg'::text where code = '01';
  perform t.ok((select layout_photos from public.cases where code = '01') = '{foto-2.jpg}', 'un admin aggiunge una seconda foto "come è dentro"');
  perform t.as_user('diego');
  update public.cases set layout_photos = layout_photos || 'foto-3.jpg'::text where code = '01';
  perform t.ok((select layout_photos from public.cases where code = '01') = '{foto-2.jpg}', 'un operatore NON può aggiungere foto');
end $t$;

reset role;
select 'TUTTI I TEST 0005 SUPERATI' as esito;
