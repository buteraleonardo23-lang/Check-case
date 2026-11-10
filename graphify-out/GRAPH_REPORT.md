# Graph Report - Check-case  (2026-11-10)

## Corpus Check
- 32 files · ~39,534 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .example 1, .toml 1)

## Summary
- 235 nodes · 539 edges · 8 communities (7 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.95)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b0305571`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- CaseDetail.tsx
- api.ts
- Check-case — CLAUDE.md
- demoData.ts
- package.json
- App.tsx
- api
- compilerOptions

## God Nodes (most connected - your core abstractions)
1. `api` - 30 edges
2. `useLoadOut()` - 17 edges
3. `react` - 15 edges
4. `CaseDetail()` - 15 edges
5. `Item` - 14 edges
6. `Check-case — CLAUDE.md` - 14 edges
7. `useToast()` - 13 edges
8. `Gate()` - 12 edges
9. `useAuth()` - 12 edges
10. `Case` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Stile (brand "Non serve saperlo")` --references--> `useToast()`  [INFERRED]
  CLAUDE.md → src/components/Toast.tsx
- `Stack` --references--> `LoadOutProvider()`  [INFERRED]
  CLAUDE.md → src/features/cases/LoadOutProvider.tsx
- `Gate()` --calls--> `CatalogPage()`  [EXTRACTED]
  src/App.tsx → src/features/admin/CatalogPage.tsx
- `Gate()` --calls--> `CaseCarousel()`  [EXTRACTED]
  src/App.tsx → src/features/cases/CaseCarousel.tsx
- `Gate()` --calls--> `CaseDetail()`  [EXTRACTED]
  src/App.tsx → src/features/cases/CaseDetail.tsx

## Import Cycles
- None detected.

## Communities (8 total, 1 thin omitted)

### Community 0 - "CaseDetail.tsx"
Cohesion: 0.15
Nodes (33): fuse.js, react-router-dom, Modal(), Ring(), useToast(), CaseForm(), CaseRow(), CatalogPage() (+25 more)

### Community 1 - "api.ts"
Cohesion: 0.09
Nodes (39): @supabase/supabase-js, active(), authListeners, commit(), Db, DbClosure, demoApi, listeners (+31 more)

### Community 2 - "Check-case — CLAUDE.md"
Cohesion: 0.06
Nodes (31): Alias, Architettura (costo zero), Attenzione: limiti del free tier, Check-case — CLAUDE.md, Chiusura case ("Tutto pronto"), Convenzioni, Cos'è, Danni (+23 more)

### Community 3 - "demoData.ts"
Cohesion: 0.32
Nodes (7): Def, defs, demoCases, demoItems, demoUsers, img(), imgs

### Community 4 - "package.json"
Cohesion: 0.06
Nodes (35): dependencies, fuse.js, react, react-dom, react-router-dom, @supabase/supabase-js, devDependencies, tailwindcss (+27 more)

### Community 5 - "App.tsx"
Cohesion: 0.13
Nodes (22): Stack, react, react-dom, AdminOnly(), App(), Gate(), Balloon(), icons (+14 more)

### Community 7 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, jsx, lib, module, moduleResolution, noEmit, noUnusedLocals, noUnusedParameters (+5 more)

## Knowledge Gaps
- **4 isolated node(s):** `@types/react`, `@types/react-dom`, `tailwindcss`, `typescript`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 101 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useToast()` connect `CaseDetail.tsx` to `Check-case — CLAUDE.md`, `App.tsx`?**
  _High betweenness centrality (0.205) - this node is a cross-community bridge._
- **What connects `@types/react`, `@types/react-dom`, `tailwindcss` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09176470588235294 - nodes in this community are weakly interconnected._
- **Why does `Stile (brand "Non serve saperlo")` connect `Check-case — CLAUDE.md` to `CaseDetail.tsx`?**
  _High betweenness centrality (0.197) - this node is a cross-community bridge._
- **Should `Check-case — CLAUDE.md` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06006006006006006 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12701612903225806 - nodes in this community are weakly interconnected._