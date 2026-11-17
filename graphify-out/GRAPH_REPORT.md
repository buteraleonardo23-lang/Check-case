# Graph Report - Check-case  (2026-11-17)

## Corpus Check
- 58 files · ~80,009 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .example 1, .toml 1)

## Summary
- 335 nodes · 820 edges · 12 communities (10 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f926ad52`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.tsx
- api
- Check-case — CLAUDE.md
- demoApi.ts
- package.json
- LogPage.tsx
- gen-setup-sql.mjs
- compilerOptions
- run.sh
- App.tsx
- Regole di dominio (il cuore dell'app)

## God Nodes (most connected - your core abstractions)
1. `api` - 48 edges
2. `useLoadOut()` - 28 edges
3. `useToast()` - 21 edges
4. `react` - 19 edges
5. `Regole di dominio (il cuore dell'app)` - 19 edges
6. `Check-case — CLAUDE.md` - 16 edges
7. `Gate()` - 15 edges
8. `CaseDetail()` - 15 edges
9. `useAuth()` - 14 edges
10. `Item` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Stile (brand "Non serve saperlo")` --references--> `useToast()`  [INFERRED]
  CLAUDE.md → src/components/Toast.tsx
- `Stack` --references--> `LoadOutProvider()`  [INFERRED]
  CLAUDE.md → src/features/cases/LoadOutProvider.tsx
- `DbClosure` --inherits--> `Closure`  [EXTRACTED]
  src/demo/demoApi.ts → src/lib/types.ts
- `Gate()` --calls--> `CatalogPage()`  [EXTRACTED]
  src/App.tsx → src/features/admin/CatalogPage.tsx
- `Gate()` --calls--> `CaseCarousel()`  [EXTRACTED]
  src/App.tsx → src/features/cases/CaseCarousel.tsx

## Import Cycles
- None detected.

## Communities (12 total, 2 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.12
Nodes (47): fuse.js, react, react-router-dom, LayoutGallery(), Photo(), Modal(), Ring(), Ctx (+39 more)

### Community 1 - "api"
Cohesion: 0.07
Nodes (31): @supabase/supabase-js, Db, Ctx, LoadOutCtx, api, isDemo, key, supabase (+23 more)

### Community 2 - "Check-case — CLAUDE.md"
Cohesion: 0.07
Nodes (24): Architettura (costo zero), Attenzione: limiti del free tier, Check-case — CLAUDE.md, Convenzioni, Cos'è, Demo, Mappa del codice (Graphify), Modello dati (Postgres) (+16 more)

### Community 3 - "demoApi.ts"
Cohesion: 0.08
Nodes (43): active(), anyItem(), authListeners, caseCode(), caseLabel(), closureOf(), commit(), DbClosure (+35 more)

### Community 4 - "package.json"
Cohesion: 0.05
Nodes (40): dependencies, fuse.js, react, react-dom, react-router-dom, @supabase/supabase-js, devDependencies, tailwindcss (+32 more)

### Community 5 - "LogPage.tsx"
Cohesion: 0.39
Nodes (7): dot(), Filter, fmtDay(), fmtTime(), LogPage(), copyText(), shareOrCopy()

### Community 6 - "gen-setup-sql.mjs"
Cohesion: 0.20
Nodes (4): migrations, src, tmp, upd

### Community 7 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, jsx, lib, module, moduleResolution, noEmit, noUnusedLocals, noUnusedParameters (+5 more)

### Community 9 - "App.tsx"
Cohesion: 0.15
Nodes (17): react-dom, AdminOnly(), App(), Gate(), Balloon(), icons, Layout(), Tab() (+9 more)

### Community 10 - "Regole di dominio (il cuore dell'app)"
Cohesion: 0.10
Nodes (19): Aggiornamenti dell'app, Alias, Cestino oggetti (solo admin), Chiusura case ("Tutto pronto"), Chiusura smontaggio (solo admin), Da sistemare (`load_out_issues`), Danni, Foto "come è dentro" (solo admin) (+11 more)

## Knowledge Gaps
- **5 isolated node(s):** `@types/node`, `@types/react`, `@types/react-dom`, `tailwindcss`, `typescript`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 140 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `api` connect `api` to `App.tsx`, `Check-case — CLAUDE.md`, `demoApi.ts`, `LogPage.tsx`, `App.tsx`, `Regole di dominio (il cuore dell'app)`?**
  _High betweenness centrality (0.224) - this node is a cross-community bridge._
- **What connects `@types/node`, `@types/react`, `@types/react-dom` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11623143881208398 - nodes in this community are weakly interconnected._
- **Why does `Check-case — CLAUDE.md` connect `Check-case — CLAUDE.md` to `Regole di dominio (il cuore dell'app)`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **Should `api` be split into smaller, more focused modules?**
  _Cohesion score 0.06628621597892889 - nodes in this community are weakly interconnected._
- **Why does `useToast()` connect `App.tsx` to `Check-case — CLAUDE.md`, `LogPage.tsx`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Should `Check-case — CLAUDE.md` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._