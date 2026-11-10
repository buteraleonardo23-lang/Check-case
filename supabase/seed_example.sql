-- Esempio di catalogo. Eseguire dall'SQL editor di Supabase dopo la migration.
insert into cases (code, name, color, sort_order) values
  ('01', 'Audio', '#38bdf8', 1),
  ('02', 'Luci',  '#facc15', 2);

insert into items (name, aliases, expected_case_id) values
  ('Scatola rossa', array['box attrezzi','cassetta rossa'], (select id from cases where code = '02')),
  ('Mixer',         array['banco','console audio'],          (select id from cases where code = '01'));

-- Profili: prima creare gli utenti in Authentication → Users con email <username>@checkcase.local,
-- poi:
-- insert into profiles (id, username, display_name, role)
-- select id, split_part(email, '@', 1), initcap(split_part(email, '@', 1)),
--        case when split_part(email, '@', 1) in ('matteo','leonardo') then 'admin' else 'operator' end
-- from auth.users;
