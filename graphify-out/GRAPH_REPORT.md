# Graph Report - Check-case  (2026-11-17)

## Corpus Check
- 60 files · ~93,097 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .example 1, .toml 1)

## Summary
- 347 nodes · 859 edges · 12 communities (10 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5edf076c`
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
1. `api` - 52 edges
2. `useLoadOut()` - 29 edges
3. `useToast()` - 21 edges
4. `Regole di dominio (il cuore dell'app)` - 20 edges
5. `react` - 19 edges
6. `CaseDetail()` - 19 edges
7. `Check-case — CLAUDE.md` - 16 edges
8. `Gate()` - 15 edges
9. `useAuth()` - 14 edges
10. `LoadOutCtx` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Stile (brand "Non serve saperlo")` --references--> `useToast()`  [INFERRED]
  CLAUDE.md → src/components/Toast.tsx
- `Sottocase / scatole (migration 0006)` --references--> `CaseDetail()`  [INFERRED]
  CLAUDE.md → src/features/cases/CaseDetail.tsx
- `Stack` --references--> `LoadOutProvider()`  [INFERRED]
  CLAUDE.md → src/features/cases/LoadOutProvider.tsx
- `Sottocase / scatole (migration 0006)` --references--> `caseProgress()`  [INFERRED]
  CLAUDE.md → src/features/cases/LoadOutProvider.tsx
- `DbContainerClosure` --inherits--> `ContainerClosure`  [EXTRACTED]
  src/demo/demoApi.ts → src/lib/types.ts

## Import Cycles
- None detected.

## Communities (12 total, 2 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.14
Nodes (35): fuse.js, LayoutGallery(), Photo(), useToast(), CaseForm(), CaseRow(), CatalogPage(), ItemForm() (+27 more)

### Community 1 - "api"
Cohesion: 0.06
Nodes (33): @supabase/supabase-js, Db, AuthCtx, Ctx, LoadOutCtx, api, isDemo, key (+25 more)

### Community 2 - "Check-case — CLAUDE.md"
Cohesion: 0.07
Nodes (24): Architettura (costo zero), Attenzione: limiti del free tier, Check-case — CLAUDE.md, Convenzioni, Cos'è, Demo, Mappa del codice (Graphify), Modello dati (Postgres) (+16 more)

### Community 3 - "demoApi.ts"
Cohesion: 0.07
Nodes (47): active(), anyItem(), authListeners, boxLabel(), caseCode(), caseLabel(), closureOf(), commit() (+39 more)

### Community 4 - "package.json"
Cohesion: 0.05
Nodes (41): dependencies, fuse.js, react, react-dom, react-router-dom, @supabase/supabase-js, devDependencies, tailwindcss (+33 more)

### Community 5 - "LogPage.tsx"
Cohesion: 0.29
Nodes (10): Modal(), FixPage(), resolutionText, dot(), Filter, fmtDay(), fmtTime(), LogPage() (+2 more)

### Community 6 - "gen-setup-sql.mjs"
Cohesion: 0.20
Nodes (4): migrations, src, tmp, upd

### Community 7 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, jsx, lib, module, moduleResolution, noEmit, noUnusedLocals, noUnusedParameters (+5 more)

### Community 9 - "App.tsx"
Cohesion: 0.13
Nodes (26): react, react-router-dom, AdminOnly(), App(), Gate(), Balloon(), icons, Layout() (+18 more)

### Community 10 - "Regole di dominio (il cuore dell'app)"
Cohesion: 0.10
Nodes (20): Aggiornamenti dell'app, Alias, Cestino oggetti (solo admin), Chiusura case ("Tutto pronto"), Chiusura smontaggio (solo admin), Da sistemare (`load_out_issues`), Danni, Foto "come è dentro" (solo admin) (+12 more)

## Knowledge Gaps
- **5 isolated node(s):** `@types/node`, `@types/react`, `@types/react-dom`, `tailwindcss`, `typescript`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 143 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `api` connect `api` to `App.tsx`, `Check-case — CLAUDE.md`, `demoApi.ts`, `LogPage.tsx`, `App.tsx`, `Regole di dominio (il cuore dell'app)`?**
  _High betweenness centrality (0.209) - this node is a cross-community bridge._
- **What connects `@types/node`, `@types/react`, `@types/react-dom` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14059196617336153 - nodes in this community are weakly interconnected._
- **Why does `react` connect `App.tsx` to `App.tsx`, `api`, `package.json`, `LogPage.tsx`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Should `api` be split into smaller, more focused modules?**
  _Cohesion score 0.06018018018018018 - nodes in this community are weakly interconnected._
- **Why does `Check-case — CLAUDE.md` connect `Check-case — CLAUDE.md` to `Regole di dominio (il cuore dell'app)`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Should `Check-case — CLAUDE.md` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._