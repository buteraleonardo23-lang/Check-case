-- Simula un database già in uso PRIMA della 0003 (come quello reale): uno smontaggio concluso a mano.
\set ON_ERROR_STOP on
set role authenticated;
select t.as_user('leonardo');
insert into public.load_outs(created_by) values (t.uid('leonardo'));
select t.as_user('matteo');
select public.place_item(t.lo(), t.iid('Scatola rossa'), t.cid('08'));
select public.place_item(t.lo(), t.iid('Mixer digitale'), t.cid('01'));
select public.place_item(t.lo(), t.iid('Cuffie regia'), t.cid('01'));
select public.unplace_item(t.lo(), t.iid('Cuffie regia'));
select t.as_user('leonardo');
update public.load_outs set status = 'closed', ended_at = now() where status = 'open';  -- vecchio "Concludi"
reset role;
