// Genera supabase/setup_completo.sql = tutte le migration + catalogo di prova (dai dati della demo).
// Uso: npm run gen:setup
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = new URL('..', import.meta.url).pathname
const src = readFileSync(join(root, 'src/demo/demoData.ts'), 'utf8')
  .replace(/import\.meta\.glob\([^)]*\)/, '({})').replace(/^import .*$/gm, '')
const tmp = join(mkdtempSync(join(tmpdir(), 'checkcase-')), 'demoData.mts')
writeFileSync(tmp, src)
const { demoCases, demoItems } = await import(pathToFileURL(tmp).href)

const q = s => s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`
const migrations = readdirSync(join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort()

let out = `-- ═══════════════════════════════════════════════════════════════
-- Check-case · SETUP COMPLETO per un progetto Supabase NUOVO
-- Incolla tutto nello SQL Editor e premi Run. (Generato da scripts/gen-setup-sql.mjs)
-- Per un progetto già esistente usa invece solo le migration nuove.
-- ═══════════════════════════════════════════════════════════════\n\n`
for (const m of migrations) out += `-- ───────── ${m} ─────────\n` + readFileSync(join(root, 'supabase/migrations', m), 'utf8') + '\n'
out += '-- ───── Catalogo di prova: 10 case, 100 oggetti (gli stessi della demo) ─────\n'
out += 'insert into public.cases (code, name, color, notes, sort_order) values\n' +
  demoCases.map(c => `  (${q(c.code)}, ${q(c.name)}, ${q(c.color)}, ${q(c.notes)}, ${c.sort_order})`).join(',\n') + '\non conflict (code) do nothing;\n\n'
out += 'insert into public.items (name, aliases, expected_case_id)\nselect v.name, v.aliases, c.id from (values\n' +
  demoItems.map(i => `  (${q(i.name)}, array[${i.aliases.map(q).join(', ')}]::text[], ${q(i.expected_case_id.slice(1))})`).join(',\n') +
  '\n) as v(name, aliases, code)\njoin public.cases c on c.code = v.code\nwhere not exists (select 1 from public.items i where i.name = v.name);\n'
writeFileSync(join(root, 'supabase/setup_completo.sql'), out)
console.log(`setup_completo.sql: ${migrations.length} migration, ${demoCases.length} case, ${demoItems.length} oggetti`)
