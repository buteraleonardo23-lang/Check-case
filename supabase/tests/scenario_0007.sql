-- Scenario 0007: cestino dei case. Gira dopo scenario_0006.sql.
\set ON_ERROR_STOP on
set role authenticated;
do $t$
declare v uuid;
begin
  perform t.as_user('leonardo');
  insert into public.cases(code, name, sort_order) values ('11', 'Case di prova', 11);
  v := t.cid('11');
  perform t.as_user('diego');
  perform t.ok(t.fails(format('select public.trash_case(%L)', v)), 'un operatore non può eliminare un case');
  perform t.as_user('leonardo');
  perform t.ok(t.fails(format('select public.trash_case(%L)', t.cid('02'))), 'un case con oggetti dentro NON va nel cestino');
  insert into public.items(name, expected_case_id) values ('Oggetto nel case 11', v);
  perform t.ok(t.fails(format('select public.trash_case(%L)', v)), 'basta un oggetto per bloccarlo');
  perform public.trash_item(t.iid('Oggetto nel case 11'));
  perform public.trash_case(v);
  perform t.ok(not (select active from public.cases where id = v), 'case vuoto: va nel cestino');
  perform t.ok(t.fails(format('select public.restore_item(%L)', t.iid('Oggetto nel case 11'))), 'non si ripristina un oggetto dentro un case nel cestino');
  perform t.ok(t.fails(format('update public.items set expected_case_id = %L where name = %L', v, 'Nastro gaffer')), 'non si assegna un oggetto a un case nel cestino');
  perform t.ok(exists (select 1 from public.activity_log where message = 'Leonardo ha spostato nel cestino il case 11 «Case di prova»')
           and not exists (select 1 from public.activity_log where action = 'case_updated' and case_id = v), 'registro: una riga sola, niente "ha modificato"');
  perform public.restore_case(v);
  perform public.restore_item(t.iid('Oggetto nel case 11'));
  perform t.ok((select active from public.cases where id = v) and (select active from public.items where name = 'Oggetto nel case 11'),
    'ripristinato il case, poi l''oggetto');
  perform t.ok(exists (select 1 from public.activity_log where message = 'Leonardo ha ripristinato il case 11 «Case di prova»'), 'registro: ripristino');
  insert into public.load_outs(created_by) values (t.uid('leonardo'));
  perform public.trash_item(t.iid('Oggetto nel case 11'));
  perform public.close_case(t.lo(), v);
  perform t.ok(t.fails(format('select public.trash_case(%L)', v)), 'un case usato nello smontaggio in corso non va nel cestino');
  perform public.end_load_out(t.lo(), true);
  perform public.trash_case(v);
  perform t.ok(not (select active from public.cases where id = v) and exists (select 1 from public.case_closures where case_id = v),
    'dopo lo smontaggio va nel cestino e il suo storico resta');
end $t$;
reset role;
select 'TUTTI I TEST 0007 SUPERATI' as esito;
