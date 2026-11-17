-- ═══════════════════════════════════════════════════════════════
-- Scenario 0006: sottocase (scatole dentro i case). Gira dopo scenario_0005.sql.
-- ═══════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
set role authenticated;

-- 14. Catalogo: solo admin, un solo livello, il contenuto segue la scatola
do $t$
declare v_box uuid;
begin
  perform t.as_user('diego');
  update public.items set is_container = true where name = 'Cassetta attrezzi';
  perform t.ok(not (select is_container from public.items where name = 'Cassetta attrezzi'), 'un operatore non può creare sottocase');

  perform t.as_user('leonardo');
  insert into public.items(name, aliases, expected_case_id, is_container) values ('Scatola cavi', '{scatola grigia}', t.cid('09'), true);
  v_box := t.iid('Scatola cavi');
  update public.items set parent_item_id = v_box where name in ('Cavi XLR (sacca)', 'Cavi DMX (sacca)', 'Cavi powercon', 'Forbici', 'Torcia frontale');
  perform t.ok((select count(*) from public.items where parent_item_id = v_box) = 5, 'Leonardo rende "Scatola cavi" un sottocase con 5 oggetti dentro');
  perform t.ok((select expected_case_id from public.items where name = 'Forbici') = t.cid('09'), 'le Forbici (erano nel 10) ora vanno nel 09 con la scatola');
  perform t.ok(t.fails($$insert into public.items(name, expected_case_id, is_container, parent_item_id) values ('Scatola nella scatola', t.cid('09'), true, t.iid('Scatola cavi'))$$),
    'niente scatola dentro scatola');
  perform t.ok(t.fails($$update public.items set parent_item_id = t.iid('Prolunga 25m') where name = 'Nastro gaffer'$$), 'si mette dentro solo a un sottocase');
  perform t.ok(t.fails($$update public.items set is_container = false where name = 'Scatola cavi'$$), 'una scatola con oggetti dentro non torna oggetto normale');
  perform t.ok(t.fails($$select public.trash_item(t.iid('Scatola cavi'))$$), 'una scatola con oggetti dentro non va nel cestino');
  update public.items set expected_case_id = t.cid('08') where name = 'Scatola cavi';
  perform t.ok((select bool_and(expected_case_id = t.cid('08')) from public.items where parent_item_id = v_box), 'la scatola passa al case 08: il contenuto la segue');
  update public.items set expected_case_id = t.cid('09') where name = 'Scatola cavi';
  perform t.ok(exists (select 1 from public.activity_log where message = 'Leonardo ha messo «Forbici» dentro la «Scatola cavi»'), 'registro: "ha messo «Forbici» dentro la «Scatola cavi»"');
end $t$;

-- 15. Smontaggio con la scatola
select t.as_user('leonardo');
insert into public.load_outs(created_by) values (t.uid('leonardo'));
do $t$
declare r jsonb; v_box uuid := t.iid('Scatola cavi');
begin
  perform t.as_user('diego');
  r := public.place_item(t.lo(), v_box, t.cid('09'));
  perform t.ok(r->>'result' = 'container_open' and jsonb_array_length(r->'missing') = 5,
    'la scatola vuota NON si mette nel case: "prima riempila e chiudila" (5 mancano)');
  r := public.place_item(t.lo(), t.iid('Cavi XLR (sacca)'), null, false, v_box);
  perform t.ok(r->>'result' = 'ok', 'Diego mette i Cavi XLR nella scatola');
  perform public.place_item(t.lo(), t.iid('Cavi DMX (sacca)'), null, false, v_box);
  perform public.place_item(t.lo(), t.iid('Forbici'), null, false, v_box);
  perform t.ok((select status from public.load_out_item_status where load_out_id = t.lo() and item_id = t.iid('Forbici')) = 'green', 'Forbici nella loro scatola: VERDE');
  perform public.place_item(t.lo(), t.iid('Torcia frontale'), t.cid('09'));
  perform t.ok((select status from public.load_out_item_status where load_out_id = t.lo() and item_id = t.iid('Torcia frontale')) = 'orange',
    'Torcia messa nel case 09 ma FUORI dalla scatola: ARANCIONE');
  r := public.place_item(t.lo(), t.iid('Torcia frontale'), null, false, v_box);
  perform t.ok(r->>'result' = 'conflict' and r->>'case_code' = '09', 'rimetterla nella scatola: avviso "è già nel case 09"');

  r := public.close_container(t.lo(), v_box);
  perform t.ok(r->>'result' = 'blocked' and r->'missing'->0->>'name' = 'Cavi powercon', 'chiudere la scatola: BLOCCATO, mancano i Cavi powercon');
  perform public.place_item(t.lo(), t.iid('Cavi powercon'), null, false, v_box);
  r := public.close_container(t.lo(), v_box);
  perform t.ok(r->>'result' = 'needs_confirm', 'scatola: chiede conferma (la Torcia è fuori)');
  r := public.close_container(t.lo(), v_box, true);
  perform t.ok(r->>'result' = 'closed', 'scatola chiusa');
  r := public.place_item(t.lo(), t.iid('Nastro gaffer'), null, false, v_box);
  perform t.ok(r->>'result' = 'container_closed', 'scatola chiusa: non si aggiunge niente');
  perform public.unplace_item(t.lo(), t.iid('Forbici'));
  perform t.ok((select status from public.load_out_item_status where load_out_id = t.lo() and item_id = t.iid('Forbici')) = 'green', 'scatola chiusa: non si toglie niente');

  r := public.place_item(t.lo(), v_box, t.cid('09'));
  perform t.ok(r->>'result' = 'ok' and (select status from public.load_out_item_status where load_out_id = t.lo() and item_id = v_box) = 'green',
    'scatola chiusa → ora si mette nel case 09: VERDE');

  r := public.close_case(t.lo(), t.cid('09'));
  perform t.ok(r->>'result' = 'blocked' and not (r->'missing' @> '[{"name": "Cavi XLR (sacca)"}]') and not (r->'missing' @> '[{"name": "Scatola cavi"}]'),
    'case 09: gli oggetti nella scatola non contano a parte, la scatola c''è');

  r := public.reopen_container(t.lo(), v_box);
  perform t.ok((select status from public.load_out_item_status where load_out_id = t.lo() and item_id = v_box) = 'red',
    'riaprire la scatola la toglie dal case (va richiusa e rimessa)');
  perform public.close_container(t.lo(), v_box, true);
  perform public.place_item(t.lo(), v_box, t.cid('09'));

  -- l'app che i ragazzi usano oggi chiama place_item con 4 parametri: deve continuare a funzionare
  r := public.place_item(t.lo(), t.iid('Nastro gaffer'), t.cid('09'), false);
  perform t.ok(r->>'result' = 'ok', 'compatibile con l''app attuale (chiamata a 4 parametri)');
end $t$;

-- 16. Registro, spostamenti, riepilogo
do $t$
declare s jsonb;
begin
  perform t.as_user('leonardo');
  perform t.ok(exists (select 1 from public.activity_log where message = 'Diego ha messo «Cavi XLR (sacca)» nella «Scatola cavi» (case 09)'),
    'registro: "Diego ha messo «Cavi XLR (sacca)» nella «Scatola cavi» (case 09)"');
  perform t.ok(exists (select 1 from public.activity_log where message = 'Diego ha messo «Torcia frontale» nel case 09 (dovrebbe stare nella «Scatola cavi»)'),
    'registro: "… nel case 09 (dovrebbe stare nella «Scatola cavi»)"');
  perform t.ok(exists (select 1 from public.activity_log where message = 'Diego ha chiuso la «Scatola cavi»')
           and exists (select 1 from public.activity_log where message = 'Diego ha riaperto la «Scatola cavi»'), 'registro: scatola chiusa e riaperta');
  s := public.load_out_summary(t.lo());
  perform t.ok(s->'misplaced' @> '[{"name": "Torcia frontale"}]', 'riepilogo: la Torcia fuori dalla scatola è "nel posto sbagliato"');
  perform public.move_item(t.iid('Torcia frontale'), t.cid('01'), false, null);
  perform t.ok((select parent_item_id is null and expected_case_id = t.cid('01') from public.items where name = 'Torcia frontale'),
    'spostare la Torcia nel case 01 la toglie dalla scatola');
  perform public.end_load_out(t.lo(), true);
end $t$;

-- 17. Un oggetto catalogato dopo la chiusura di uno smontaggio non diventa "non trovato" in quello smontaggio
do $t$
declare v_lo uuid; n_before int;
begin
  perform t.as_user('leonardo');
  v_lo := (select id from public.load_outs where status = 'closed' order by ended_at desc limit 1);
  insert into public.items(name, expected_case_id) values ('Catalogato dopo', t.cid('02'));
  n_before := (select count(*) from public.load_out_issues where load_out_id = v_lo);
  perform public.create_issues(v_lo);
  perform t.ok((select count(*) from public.load_out_issues where load_out_id = v_lo) = n_before
           and not exists (select 1 from public.load_out_issues where item_id = t.iid('Catalogato dopo')),
    'rilanciare l''aggiornamento non crea voci per oggetti catalogati dopo');
end $t$;

reset role;
select 'TUTTI I TEST 0006 SUPERATI' as esito;
