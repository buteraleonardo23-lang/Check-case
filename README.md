# Check-case

PWA per lo smontaggio dello spettacolo: checklist dei case con stato verde / arancione / rosso, chiusura case con controlli, ricerca "dove va?" e dashboard live per gli admin. Dettagli di progetto in [CLAUDE.md](CLAUDE.md).

## Messa online (tutto gratis)

1. **Supabase** — crea un progetto su supabase.com.
   - SQL Editor → incolla ed esegui `supabase/migrations/0001_init.sql`.
   - Authentication → Providers → Email: disattiva "Confirm email" e le registrazioni pubbliche.
   - Authentication → Users → crea gli utenti `matteo@checkcase.local`, `leonardo@checkcase.local`, `lorenzo@…`, `rossana@…`, `diego@…` con le loro password.
   - SQL Editor → esegui il blocco profili in `supabase/seed_example.sql` (Matteo e Leonardo diventano admin).
   - Inserisci case e oggetti (per ora da SQL o Table Editor; la schermata di gestione catalogo arriva dopo).
2. **Netlify** — "Import from GitHub" questo repo; imposta le variabili `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Project Settings → API in Supabase).
3. **GitHub** — in Settings → Secrets → Actions aggiungi `SUPABASE_URL` e `SUPABASE_ANON_KEY` per il keep-alive.
4. Sul telefono apri il sito → Condividi → **Aggiungi a schermata Home**.

## Sviluppo

```bash
cp .env.example .env.local   # e compila
npm install
npm run dev
```
