# Graph Report - Check-case  (2026-11-11)

## Corpus Check
- 48 files · ~55,277 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .example 1, .toml 1)

## Summary
- 297 nodes · 716 edges · 9 communities (8 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.95)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `95989be6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.tsx
- api
- Check-case — CLAUDE.md
- demoApi.ts
- package.json
- CatalogPage.tsx
- gen-setup-sql.mjs
- compilerOptions
- run.sh

## God Nodes (most connected - your core abstractions)
1. `api` - 37 edges
2. `useLoadOut()` - 25 edges
3. `react` - 17 edges
4. `useToast()` - 16 edges
5. `Check-case — CLAUDE.md` - 16 edges
6. `CaseDetail()` - 15 edges
7. `Gate()` - 14 edges
8. `useAuth()` - 14 edges
9. `Item` - 14 edges
10. `Regole di dominio (il cuore dell'app)` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Stile (brand "Non serve saperlo")` --references--> `useToast()`  [INFERRED]
  CLAUDE.md → src/components/Toast.tsx
- `Stack` --references--> `LoadOutProvider()`  [INFERRED]
  CLAUDE.md → src/features/cases/LoadOutProvider.tsx
- `DbClosure` --inherits--> `Closure`  [EXTRACTED]
  src/demo/demoApi.ts → src/lib/types.ts
- `Gate()` --calls--> `CatalogPage()`  [EXTRACTED]
  src/App.tsx → src/features/admin/CatalogPage.tsx
- `Gate()` --calls--> `LogPage()`  [EXTRACTED]
  src/App.tsx → src/features/log/LogPage.tsx

## Import Cycles
- None detected.

## Communities (9 total, 1 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.13
Nodes (36): react-dom, react-router-dom, AdminOnly(), App(), Gate(), Balloon(), icons, Layout() (+28 more)

### Community 1 - "api"
Cohesion: 0.08
Nodes (30): @supabase/supabase-js, Db, AuthCtx, Ctx, LoadOutCtx, api, isDemo, key (+22 more)

### Community 2 - "Check-case — CLAUDE.md"
Cohesion: 0.05
Nodes (38): Alias, Architettura (costo zero), Attenzione: limiti del free tier, Check-case — CLAUDE.md, Chiusura case ("Tutto pronto"), Chiusura smontaggio (solo admin), Convenzioni, Cos'è (+30 more)

### Community 3 - "demoApi.ts"
Cohesion: 0.09
Nodes (38): active(), authListeners, caseCode(), caseLabel(), closureOf(), commit(), DbClosure, DbIssue (+30 more)

### Community 4 - "package.json"
Cohesion: 0.05
Nodes (40): dependencies, fuse.js, react, react-dom, react-router-dom, @supabase/supabase-js, devDependencies, tailwindcss (+32 more)

### Community 5 - "CatalogPage.tsx"
Cohesion: 0.13
Nodes (27): fuse.js, react, Modal(), Ctx, T, Tone, tones, useToast() (+19 more)

### Community 6 - "gen-setup-sql.mjs"
Cohesion: 0.22
Nodes (3): migrations, src, tmp

### Community 7 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, jsx, lib, module, moduleResolution, noEmit, noUnusedLocals, noUnusedParameters (+5 more)

## Knowledge Gaps
- **5 isolated node(s):** `@types/node`, `@types/react`, `@types/react-dom`, `tailwindcss`, `typescript`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 124 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useToast()` connect `CatalogPage.tsx` to `App.tsx`, `Check-case — CLAUDE.md`?**
  _High betweenness centrality (0.193) - this node is a cross-community bridge._
- **What connects `@types/node`, `@types/react`, `@types/react-dom` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12816326530612246 - nodes in this community are weakly interconnected._
- **Why does `Stile (brand "Non serve saperlo")` connect `Check-case — CLAUDE.md` to `CatalogPage.tsx`?**
  _High betweenness centrality (0.185) - this node is a cross-community bridge._
- **Should `api` be split into smaller, more focused modules?**
  _Cohesion score 0.07540983606557378 - nodes in this community are weakly interconnected._
- **Should `Check-case — CLAUDE.md` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `demoApi.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09191583610188261 - nodes in this community are weakly interconnected._