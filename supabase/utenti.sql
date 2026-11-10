-- ═══════════════════════════════════════════════════════════════
-- Check-case · RUOLI UTENTI (passo 4 della guida)
-- Prima crea gli utenti in Authentication → Users → Add user
-- con email <username>@checkcase.local e "Auto Confirm User" attivo.
-- Poi incolla questo nello SQL Editor e premi Run.
-- ═══════════════════════════════════════════════════════════════
insert into public.profiles (id, username, display_name, role)
select id,
       split_part(email, '@', 1),
       initcap(split_part(email, '@', 1)),
       case split_part(email, '@', 1)
         when 'leonardo' then 'admin'
         else 'operator'          -- matteo: operatore solo per la prova
       end
from auth.users
where email like '%@checkcase.local'
on conflict (id) do update set role = excluded.role;

-- Controllo: deve mostrare leonardo = admin e matteo = operator
select username, display_name, role from public.profiles order by username;
