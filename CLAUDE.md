# Check-case — CLAUDE.md

> Contesto del progetto per Claude e per chiunque ci lavori. Lingua del progetto: **italiano** (UI, documentazione, commit). Codice e nomi di variabili in inglese.

## Cos'è

Web app (PWA installabile sulla home del telefono) per lo **smontaggio di uno spettacolo teatrale**: serve a non perdere oggetti mentre si riempiono i case. Sostituisce le liste di carta con check.

Ogni case ha una lista di oggetti attesi e una **foto di riferimento** di come va riempito. Gli operatori flaggano gli oggetti man mano che li mettono dentro; gli admin vedono in tempo reale lo stato di tutti i case.

## Utenti e ruoli

| Ruolo | Persone | Può fare |
|---|---|---|
| `admin` | Matteo, Leonardo | Tutto: riempire case, dashboard, gestione catalogo (case/oggetti/foto), recap, storico, chiusure forzate |
| `operator` | Lorenzo, Rossana, Diego | Riempire case, cercare oggetti, segnalare danni |

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

### Danni
Su ogni oggetto si può segnalare un danno: descrizione + foto opzionale. Il danno resta "aperto" finché un admin non lo segna come risolto.

### Ricerca "dove va?"
Cerca un oggetto → mostra il case previsto (con foto) e, se c'è uno smontaggio in corso, dove è stato effettivamente messo e da chi.

## Architettura (costo zero)

```
 Telefoni (PWA installata)
   │  React + Vite + TS, Service Worker, IndexedDB (coda offline)
   │
   ├── Netlify (free)        → hosting statico + deploy da GitHub
   │
   └── Supabase (free)
         ├── Postgres + Row Level Security (permessi per ruolo)
         ├── Auth (username/password)
         ├── Realtime (dashboard live, conflitti tra operatori)
         ├── Storage (foto case/oggetti/danni, compresse lato client)
         └── Edge Functions + pg_cron (Web Push, recap programmato, keep-alive)
```

### Stack
- **Frontend**: Vite + React + TypeScript + Tailwind CSS, `vite-plugin-pwa` (manifest + service worker), React Router, TanStack Query.
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
items           id, name, aliases text[], expected_case_id → cases, quantity, photo_path, notes, active
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
- Oggetti extra non a catalogo: creati al volo come `items` con `expected_case_id = NULL` (da sistemare poi dall'admin).

### Permessi (RLS)
- `operator`: SELECT su catalogo e smontaggio corrente; INSERT/UPDATE su `placements`, `case_closures` (non forzate), `damage_reports`.
- `admin`: tutto, incluse modifiche catalogo, chiusure forzate, risoluzione danni, gestione utenti.

## Schermate

**Operatori (e admin)**
1. Login
2. Lista case dello smontaggio corrente (progress bar per case: es. 12/15)
3. Dettaglio case: foto di riferimento (zoomabile), checklist con colori, sezione "Oggetti extra" + pulsante "Aggiungi oggetto qui" (ricerca), pulsante **Tutto pronto**
4. Ricerca "Dove va?"
5. Segnala danno

**Solo admin**
6. Dashboard live: tutti i case, % completamento, oggetti 🔴/🟠, feed attività (chi/cosa/quando)
7. Recap pre-replica
8. Storico smontaggi
9. Gestione catalogo: case, oggetti, alias, foto, utenti
10. Danni aperti

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
2. Danni, recap, storico, notifiche push, coda offline.
3. QR code.
4. Riconoscimento da foto.

## Convenzioni

- Struttura prevista: `src/` (app React), `src/features/<area>/`, `supabase/migrations/` (SQL versionato), `supabase/functions/` (Edge Functions).
- Ogni modifica allo schema = nuova migration SQL, mai modifiche a mano dalla dashboard.
- Mobile-first: pulsanti grandi, usabili con guanti e al buio; dark mode di default.
- Variabili d'ambiente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` (mai committare chiavi `service_role`).
