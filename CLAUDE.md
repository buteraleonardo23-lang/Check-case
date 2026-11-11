# Check-case — CLAUDE.md

> Contesto del progetto per Claude e per chiunque ci lavori. Lingua del progetto: **italiano** (UI, documentazione, commit). Codice e nomi di variabili in inglese.

## Cos'è

**Dimensioni**: uno spettacolo solo, ~10 case, ~200-250 oggetti. Ogni oggetto è unico (nessuna quantità multipla).

Web app (PWA installabile sulla home del telefono) per lo **smontaggio di uno spettacolo teatrale**: serve a non perdere oggetti mentre si riempiono i case. Sostituisce le liste di carta con check.

Ogni case ha una lista di oggetti attesi e una **foto di riferimento** di come va riempito. Gli operatori flaggano gli oggetti man mano che li mettono dentro; gli admin vedono in tempo reale lo stato di tutti i case.

## Utenti e ruoli

| Ruolo | Persone | Può fare |
|---|---|---|
| `admin` | Matteo, Leonardo | Tutto: riempire case, dashboard, gestione catalogo (case/oggetti/foto), recap, storico, chiusure forzate, **punteggi** |
| `operator` | Lorenzo, Rossana, Diego | Riempire case, mettere in un case oggetti di un altro case ("Oggetti extra"), cercare oggetti, segnalare danni. **Non** possono creare oggetti nuovi nel catalogo |

Login con **username + password** (niente email visibile: internamente username → `username@checkcase.local` su Supabase Auth). Account creati solo dagli admin, nessuna registrazione pubblica.

## Regole di dominio (il cuore dell'app)

### Stato di un oggetto durante uno smontaggio
Per ogni oggetto del catalogo, rispetto al **suo case previsto**:
- 🟢 **Verde** — messo nel case previsto.
- 🟠 **Arancione** — messo in un **altro** case (si sa dov'è, ma non è il posto giusto).
- 🔴 **Rosso** — non messo in nessun case.

Nel case "sbagliato" che lo ha ricevuto, l'oggetto compare nella sezione **"Oggetti extra"** del case (badge con il case di origine).

### Chiusura case ("Tutto pronto")
1. Se c'è almeno un oggetto 🔴 → **blocco**: "Attenzione, manca: …". Il case non si chiude (solo un admin può forzare, con nota obbligatoria).
2. Se ci sono solo 🟠 → conferma: "Scatola rossa è nel case 8. Vuoi comunque chiudere?" → si può chiudere.
3. Tutto 🟢 → chiusura diretta.
Un case chiuso si può riaprire (resta traccia nel log).

### Tracciabilità
Ogni azione (oggetto messo, tolto, spostato, case chiuso/riaperto, danno) è un **evento** con autore e timestamp. Così si sa chi ha messo la scatola rossa nell'8 invece che nel 9.

### Un oggetto, un posto
Durante uno smontaggio un oggetto può essere in **un solo case** alla volta (vincolo DB). Se due persone lo segnano insieme, il secondo riceve: "Diego l'ha già messo nel case 9".

### Alias
Ogni oggetto ha un nome principale + **alias** (es. "scatola rossa", "box attrezzi", "cassetta Rossana"). La ricerca lavora su nome + alias, tollerante a errori di battitura e accenti.

### Recap pre-replica
Prima della replica successiva l'admin apre (o riceve via notifica qualche giorno prima) il recap: tutti gli oggetti 🟠 dell'ultimo smontaggio ("la scorsa volta la scatola rossa era nel case 8 invece del 9"), case chiusi forzatamente e danni aperti.

### Punteggi (solo admin)
Classifica degli operatori (chi è stato il migliore / il più veloce), calcolata dal log degli eventi. **Criteri ancora da definire con Leonardo** — non inventarli. Visibile solo a Matteo e Leonardo (RLS + UI).

### Spostamento definitivo di un oggetto (solo admin)
Dal Catalogo un admin può riassegnare un oggetto a un altro case. Il case previsto cambia **subito**; l'admin sceglie:
- **È già lì** → spostamento `done`.
- **Da spostare alla prossima replica** → spostamento `pending`: compare come promemoria nelle schede dei due case e nella tab Spostamenti; diventa `done` da solo quando l'oggetto viene messo nel nuovo case (trigger DB) o a mano con "Fatto".
Tabella `item_moves`, RPC `move_item` / `complete_move` (migration 0002).

### Registro attività (tutto, sempre)
Ogni azione finisce in `activity_log` tramite **trigger DB** (non dipende dall'app): messo / messo nel case sbagliato / tolto, case chiuso / forzato / riaperto, smontaggio iniziato / concluso + riepilogo, riassegnazioni, catalogo, risoluzioni. Messaggi già leggibili ("Matteo ha messo «Scatola rossa» nel case 08 (dovrebbe stare nel case 05)"). Solo admin lo leggono. Pagina **Registro** (da Dashboard) con **"Copia per Claude"**: incollato in chat serve a ricostruire cosa è successo.

### Chiusura smontaggio (solo admin)
"Concludi smontaggio" → RPC `end_load_out(p_confirm=false)` restituisce il **riepilogo** (nel case sbagliato con chi l'ha messo, non trovati per case, case ancora aperti) → l'admin conferma → `end_load_out(true)` chiude e crea le voci **Da sistemare**. Non si chiude più direttamente dalla tabella (policy).

### Da sistemare (`load_out_issues`)
Nate alla chiusura: `misplaced` (case sbagliato) e `missing` (non trovato: perso o non segnato). Banner per gli admin in home/dashboard finché ce ne sono, badge nella barra.
- misplaced → "Rimesso nel XX" (`fixed`) o "Resta nel YY" (`reassigned`: cambia il case previsto via `move_item`).
- missing → "Trovato" (`found`) o "Perso" (stato `lost` = da ricomprare) → "Ricomprato" (`replaced`). "Chiedi ai ragazzi" prepara il messaggio per WhatsApp. "Ignora tutti" (`dismissed`) dopo uno smontaggio di prova.
- Si chiudono **da sole** allo smontaggio successivo: oggetto messo nel suo case → `fixed`; oggetto non trovato che ricompare → `found`.
- Le riassegnazioni decise (`item_moves` pending) stanno nella stessa pagina.

### Danni
Su ogni oggetto si può segnalare un danno: descrizione + foto opzionale. Il danno resta "aperto" finché un admin non lo segna come risolto.

### Ricerca "dove va?"
Cerca un oggetto → mostra il case previsto (con foto) e, se c'è uno smontaggio in corso, dove è stato effettivamente messo e da chi.

## Architettura (costo zero)

```
 Telefoni (PWA installata)
   │  React + Vite + TS, Service Worker, IndexedDB (coda offline)
   │
   ├── GitHub Pages (free)   → hosting statico + deploy automatico (workflow pages.yml)
   │
   └── Supabase (free)
         ├── Postgres + Row Level Security (permessi per ruolo)
         ├── Auth (username/password)
         ├── Realtime (dashboard live, conflitti tra operatori)
         ├── Storage (foto case/oggetti/danni, compresse lato client)
         └── Edge Functions + pg_cron (Web Push, recap programmato, keep-alive)
```

### Stack
- **Frontend**: Vite + React + TypeScript + Tailwind CSS, `vite-plugin-pwa` (manifest + service worker), React Router. Stato condiviso in `LoadOutProvider` (React context + Supabase Realtime).
- **Backend**: Supabase (`@supabase/supabase-js`). Nessun server custom.
- **Ricerca**: catalogo intero caricato in memoria (sono centinaia di oggetti, non milioni) + **Fuse.js** per ricerca fuzzy su nome/alias. Funziona anche offline.
- **Foto**: compressione lato client (`browser-image-compression`, ~1600px, ~200 KB) prima dell'upload → il GB gratuito di Supabase basta per anni.
- **Notifiche**: Web Push standard (VAPID) inviate da una Edge Function. Su iPhone funzionano **solo se la PWA è aggiunta alla schermata Home** (iOS ≥ 16.4).
- **Offline**: le azioni (flag, chiusura, danni) vanno in una coda IndexedDB e si sincronizzano al ritorno della rete. Il backstage spesso ha poco segnale: requisito importante.

### Perché non Tailscale
Tailscale richiederebbe un server sempre acceso e il client installato su ogni telefono. Netlify + Supabase è gratuito, raggiungibile da ovunque, senza manutenzione.

### Attenzione: limiti del free tier
- **Supabase mette in pausa i progetti dopo ~7 giorni senza attività.** Tra una replica e l'altra può succedere → job keep-alive settimanale (GitHub Actions cron o pg_cron/Netlify scheduled function che fa una query).
- Supabase free: 500 MB DB, 1 GB storage, 50k utenti attivi/mese → ampiamente sufficiente.
- Fare **export periodico** del DB (GitHub Action con `pg_dump` su branch/artifact) per non dipendere dal free tier.

## Modello dati (Postgres)

```
profiles        id (= auth.users.id), username, display_name, role ('admin'|'operator'), active
cases           id, code ("08"), name, color, photo_path, layout_photo_path, notes, sort_order, active
items           id, name, aliases text[], expected_case_id → cases, photo_path, notes, active
shows           id, title, date, venue                          -- repliche (per il recap programmato)
load_outs       id, show_id → shows, started_at, ended_at, status ('open'|'closed'), created_by
placements      id, load_out_id, item_id, case_id, placed_by, placed_at, removed_at, removed_by
                UNIQUE (load_out_id, item_id) WHERE removed_at IS NULL
case_closures   id, load_out_id, case_id, closed_by, closed_at, reopened_at, reopened_by,
                forced bool, note
damage_reports  id, item_id, load_out_id, reported_by, description, photo_path,
                created_at, resolved_at, resolved_by
push_subscriptions  id, user_id, endpoint, keys jsonb, created_at
```

- Lo stato verde/arancione/rosso **non si salva**: si calcola (vista SQL `load_out_item_status`) da `items.expected_case_id` + placement attivo.
- `placements` non si cancella mai (soft delete con `removed_at`) → storico completo e "chi ha fatto cosa".
- Il catalogo (`cases`, `items`) è modificabile solo dagli admin.
- Punteggi: calcolati da `placements`/`case_closures` (funzione/vista leggibile solo da admin), criteri TBD.

### Permessi (RLS)
- `operator`: SELECT su catalogo e smontaggio corrente; INSERT/UPDATE su `placements`, `case_closures` (non forzate), `damage_reports`.
- `admin`: tutto, incluse modifiche catalogo, chiusure forzate, risoluzione danni, gestione utenti.

## Schermate

**Operatori (e admin)**
1. Login
2. **Home: carosello orizzontale dei case** (scroll da destra a sinistra, una card per case con foto, numero e progresso es. 12/15). Tap sulla card → scheda del case
3. Dettaglio case: foto di riferimento (zoomabile), checklist con colori, sezione "Oggetti extra" + pulsante "Aggiungi oggetto qui" (ricerca), pulsante **Tutto pronto**
4. Ricerca "Dove va?"
5. Segnala danno

**Solo admin**
6. Dashboard live: tutti i case, % completamento, oggetti 🔴/🟠, feed attività (chi/cosa/quando)
7. Recap pre-replica
8. Storico smontaggi
9. Gestione catalogo: case, oggetti, alias, foto, utenti
10. Danni aperti
11. Punteggi / classifica operatori

### Notifiche push (admin)
- Case chiuso (con eventuali 🟠)
- Tutti i case chiusi → "Tutto pronto per il carico"
- Tentativo di chiusura bloccato / chiusura forzata
- Nuovo danno segnalato
- Recap N giorni prima della replica (`shows.date`)

## Riconoscimento oggetti da foto (fase futura, opzionale)

Due strade a costo zero, da valutare dopo l'MVP:
1. **QR code / etichette** su oggetti e case (consigliato, affidabile al 100%): scansione con la fotocamera → apre direttamente l'oggetto o il case.
2. **AI nel browser**: embedding visivi (modello CLIP/MobileCLIP via Transformers.js, scaricato una volta e messo in cache) calcolati sulle foto di riferimento degli oggetti; la foto scattata viene confrontata localmente → top 3 suggerimenti "probabilmente è X, va nel case 8". Nessun server AI, nessun costo, funziona anche offline. Precisione dipende da quanto gli oggetti sono distinguibili (molte scatole nere uguali = difficile).

## Roadmap

1. **MVP**: auth + ruoli, catalogo (case/oggetti/alias/foto), smontaggio con checklist e colori, chiusura case con regole, ricerca, dashboard live.
2. Danni, recap, storico, notifiche push, coda offline, punteggi (dopo aver definito i criteri).
3. QR code.
4. Riconoscimento da foto.

## Convenzioni

- Struttura prevista: `src/` (app React), `src/features/<area>/`, `supabase/migrations/` (SQL versionato), `supabase/functions/` (Edge Functions).
- Ogni modifica allo schema = nuova migration SQL, mai modifiche a mano dalla dashboard.
- Mobile-first: pulsanti grandi, usabili con guanti e al buio; dark mode di default.
- Variabili d'ambiente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` (mai committare chiavi `service_role`).

## Stile (brand "Non serve saperlo")

Ispirato a nonservesaperlo.it, lo spettacolo di Leonardo:
- Font **Sora** (Google Fonts); titoli MAIUSCOLI extrabold, sottotitoli maiuscoli con letter-spacing ampio (`eyebrow`).
- Fondo palco `#080E10` con faretto blu (`#0B2A55`) in alto; testo `#E8ECEE`, secondario `#A1A4A5`.
- Accento ciano `#0BB9EA` (il bottone "Prenota i biglietti"); bottoni a **pillola**.
- Motivo: il **palloncino blu** (`components/Balloon.tsx`).
- Colori di stato separati dall'accento: ok `#2BD576`, warn `#FF9F1C`, bad `#FF4D4D`.
- Token in `src/index.css` (`@theme`) e utility `eyebrow`, `title`, `btn-*`, `field`, `glass`, `chip`.
- Niente `alert()`/`confirm()`: usare `useToast()` e conferme dentro la pagina.

## Demo

- `api` (`src/lib/api.ts`) è l'unico punto di accesso ai dati: `supabaseApi` in produzione, `demoApi` (in memoria, stesse regole delle RPC) se `VITE_DEMO=true` o Supabase non è configurato.
- Dati demo in `src/demo/demoData.ts`: 10 case, 100 oggetti inventati, foto Unsplash in `src/demo/img/`.
- `npm run build:demo` → `dist-demo/index.html`, un unico file con tutto incluso (router in memoria, niente service worker).
- Se cambia una regola, va cambiata **sia** nell'SQL **sia** in `demoApi.ts`.

## Mappa del codice (Graphify)

Grafo del codice in `graphify-out/` (costruito localmente con tree-sitter, nessuna AI, nessun costo). **Prima di leggere file a tappeto, interroga il grafo:**
- `graphify-out/GRAPH_REPORT.md` → panoramica: nodi centrali, comunità, collegamenti.
- `graphify query "domanda"` → sottografo pertinente; `graphify explain "X"`; `graphify path "A" "B"`.
- Dopo modifiche al codice: `graphify update .` e committa `graphify-out/` (la cache è ignorata).
- Installazione: `pipx install graphifyy==0.9.94` (versione fissata di proposito).

## Test (da lanciare dopo ogni modifica alle regole)

- `npm test` → scenario completo sulla **demo** (`src/demo/demoApi.scenario.ts`, gira dentro Vite).
- `DATABASE_URL=postgres://…vuoto npm run test:db` → stesso scenario sul **database** con RLS e utenti veri (`supabase/tests/`). In questo container: Postgres in `/var/lib/postgresql/cc-test` (la cartella scratchpad perde i permessi).
- `supabase/tests/upgrade*.sql` → aggiornamento di un DB già in uso (applica la migration due volte).
- `npm run gen:setup` → rigenera `supabase/setup_completo.sql` (tutte le migration + catalogo di prova) per progetti nuovi.

## Produzione

- Sito: **https://buteraleonardo23-lang.github.io/Check-case/** (GitHub Pages, workflow `pages.yml` a ogni push sul branch di sviluppo, che è anche il default).
- Supabase: progetto `gbzrvzgzfrerusklmbjh`, config pubblica in `.env.production`. Le migration nuove le esegue **Leonardo a mano** nello SQL Editor (non abbiamo chiavi admin): dirgli quale file incollare.
- Utenti: `leonardo` (admin), `matteo` (operatore per ora, solo per prova).

## Stato attuale

- Fatto: schema + RLS + RPC (placement, chiusura con regole, spostamenti), login, carosello case, scheda case con checklist, oggetti extra e promemoria spostamenti, ricerca "Dove va?", dashboard live, catalogo admin (nuovi case/oggetti, foto, alias, spostamenti), **registro attività + Copia per Claude, chiusura smontaggio con riepilogo, Da sistemare (= recap pre-replica)**, demo, test DB + demo, keep-alive, deploy GitHub Pages.
- Da fare: danni, notifiche push, coda offline, punteggi (criteri da Leonardo), riordino case, gestione utenti da app.
- Le regole di dominio sono applicate **lato DB nelle RPC**, la UI le riflette soltanto: modificare prima l'SQL.
