// Scenario di test della demo: stesse regole verificate da supabase/tests/scenario.sql.
// Si lancia con: npm test
import { demoApi as api, resetDemo } from './demoApi'

let failed = 0
const ok = (cond: unknown, msg: string) => {
  if (cond) console.log(`  ok  ${msg}`)
  else { failed++; console.log(`  ✗   ${msg}`) }
}
const throws = async (fn: () => Promise<unknown>) => { try { await fn(); return false } catch { return true } }
const as = (u: string) => api.signIn(u, '')

export async function run() {
  resetDemo()
  const cat = async () => api.loadCatalog()
  const id = async (name: string) => (await cat()).items.find(i => i.name === name)!.id
  const cid = (code: string) => `c${code}`
  const st = async (lo: string, name: string) => (await api.loadState(lo)).status.find(s => s.item_name === name)!

  console.log('Demo · smontaggio già in corso (dati iniziali)')
  await as('leonardo')
  let issues = await api.issues()
  ok(issues.filter(i => i.status !== 'resolved').length === 3, 'dallo smontaggio precedente: 3 voci da sistemare (banner)')
  ok((await api.activityLog('lo-demo')).some(l => l.message === 'Diego ha messo «Scatola rossa» nel case 08 (dovrebbe stare nel case 05)'),
    'registro della demo: "Diego ha messo «Scatola rossa» nel case 08 (dovrebbe stare nel case 05)"')

  console.log('Chiusura smontaggio con riepilogo')
  await as('diego')
  ok(await throws(() => api.loadOutSummary('lo-demo')), 'un operatore non può concludere lo smontaggio')
  ok(await throws(() => api.startLoadOut()), 'un operatore non può iniziare lo smontaggio')
  await as('leonardo')
  const s = await api.loadOutSummary('lo-demo')
  ok(s.misplaced.length === 2 && s.misplaced.some(m => m.name === 'Scatola rossa' && m.actual_code === '08' && m.by === 'Diego'),
    'riepilogo: 2 nel case sbagliato (Scatola rossa nel 08, messa da Diego)')
  ok(s.missing.length === s.total - s.placed && s.missing.length === 100 - 58, `riepilogo: ${s.missing.length} non trovati`)
  ok(s.open_cases.includes('05') && !s.open_cases.includes('01'), 'riepilogo: case aperti elencati')
  await api.endLoadOut('lo-demo')
  ok((await cat()).loadOut === null, 'smontaggio concluso')
  issues = await api.issues()
  ok(issues.filter(i => i.load_out_id === 'lo-demo' && i.kind === 'misplaced').length === 2
    && issues.filter(i => i.load_out_id === 'lo-demo' && i.kind === 'missing').length === s.missing.length, 'create le voci "Da sistemare"')
  ok((await api.activityLog('lo-demo')).some(l => l.action === 'load_out_summary'), 'registro: riepilogo confermato')

  console.log('Nuovo smontaggio')
  await api.startLoadOut()
  ok(await throws(() => api.startLoadOut()), 'non si aprono due smontaggi insieme')
  const lo = (await cat()).loadOut!.id

  await as('matteo')
  ok((await api.place(lo, await id('Scatola rossa'), cid('08'), false)).result === 'ok', 'Matteo mette la Scatola rossa nel 08 (sbagliato)')
  ok((await st(lo, 'Scatola rossa')).status === 'orange', 'risulta ARANCIONE')
  await as('diego')
  const c = await api.place(lo, await id('Scatola rossa'), cid('05'), false)
  ok(c.result === 'conflict' && c.case_code === '08' && c.by === 'Matteo', 'Diego: avviso "già nel case 08 da Matteo"')
  await api.place(lo, await id('Scatola rossa'), cid('05'), true)
  ok((await st(lo, 'Scatola rossa')).status === 'green', 'Diego la sposta nel 05: VERDE')
  ok((await api.issues()).find(i => i.load_out_id === 'lo-demo' && i.item_id === 'i05-1')?.resolution === 'fixed',
    'la voce dello smontaggio prima si chiude da sola ("rimessa a posto")')
  await api.place(lo, await id('Foulard colorati'), cid('05'), false)
  ok((await api.issues()).find(i => i.load_out_id === 'lo-prev' && i.item_id === 'i05-6')?.resolution === 'found',
    'il Foulard (non trovato due smontaggi fa) ricompare: "ritrovato"')

  await api.place(lo, await id('Cuffie regia'), cid('01'), false)
  await api.unplace(lo, await id('Cuffie regia'))
  ok((await st(lo, 'Cuffie regia')).status === 'red', 'spunta tolta: torna ROSSA')

  for (const i of (await cat()).items.filter(i => i.expected_case_id === cid('01') && i.name !== 'Cuffie regia'))
    await api.place(lo, i.id, cid('01'), false)
  let r = await api.closeCase(lo, cid('01'), {})
  ok(r.result === 'blocked' && r.missing[0].name === 'Cuffie regia', 'case 01 BLOCCATO: mancano le Cuffie')
  r = await api.closeCase(lo, cid('01'), { force: true, note: 'provo' })
  ok(r.result === 'blocked', 'un operatore non può forzare')
  await as('leonardo')
  ok((await api.closeCase(lo, cid('01'), { force: true, note: '' })).result === 'blocked', 'l\'admin non forza senza nota')
  ok((await api.closeCase(lo, cid('01'), { force: true, note: 'cuffie in regia' })).result === 'closed', 'l\'admin forza con nota')
  await as('diego')
  ok((await api.place(lo, await id('Cuffie regia'), cid('01'), false)).result === 'case_closed', 'case chiuso: non si aggiunge niente')
  await api.reopenCase(lo, cid('01'))
  await api.place(lo, await id('Cuffie regia'), cid('01'), false)
  ok((await api.closeCase(lo, cid('01'), {})).result === 'closed', 'riaperto, completato e chiuso normalmente')

  for (const i of (await cat()).items.filter(i => i.expected_case_id === cid('03') && i.name !== 'Microfono vintage'))
    await api.place(lo, i.id, cid('03'), false)
  await api.place(lo, await id('Microfono vintage'), cid('04'), false)
  ok((await api.closeCase(lo, cid('03'), {})).result === 'needs_confirm', 'case 03: chiede conferma (microfono nel 04)')
  ok((await api.closeCase(lo, cid('03'), { confirm: true })).result === 'closed', 'case 03 chiuso dopo conferma')

  console.log('Registro')
  const logs = await api.activityLog(lo)
  const has = (m: string) => logs.some(l => l.message === m)
  ok(has('Matteo ha messo «Scatola rossa» nel case 08 (dovrebbe stare nel case 05)'), 'messo nel case sbagliato')
  ok(has('Diego ha tolto «Scatola rossa» dal case 08') && has('Diego ha messo «Scatola rossa» nel case 05'), 'spostamento = tolto + messo')
  ok(has('Diego ha tolto «Cuffie regia» dal case 01'), 'spunta tolta')
  ok(has('Leonardo ha FORZATO la chiusura del case 01 (nota: cuffie in regia)'), 'chiusura forzata con nota')
  ok(has('Diego ha riaperto il case 01'), 'riapertura')

  console.log('Da sistemare: risoluzioni')
  await as('leonardo')
  await api.endLoadOut(lo)
  issues = await api.issues()
  const find = async (item: string) => (await api.issues()).find(i => i.load_out_id === lo && i.item_id === item)!
  const mic = await find(await id('Microfono vintage'))
  await as('diego')
  ok(await throws(() => api.resolveIssues([mic.id], 'fixed', null)), 'un operatore non può risolvere')
  await as('leonardo')
  await api.resolveIssues([mic.id], 'reassigned', null)
  ok((await cat()).items.find(i => i.name === 'Microfono vintage')!.expected_case_id === cid('04'), '"Resta nel 04": ora il microfono va nel 04')
  ok((await find(mic.item_id)).status === 'resolved', 'voce chiusa')
  const uku = await find(await id('Ukulele'))
  await api.resolveIssues([uku.id], 'lost', null)
  ok((await find(uku.item_id)).status === 'lost', 'Ukulele PERSO: resta da ricomprare')
  await api.resolveIssues([uku.id], 'replaced', null)
  ok((await find(uku.item_id)).resolution === 'replaced', 'Ukulele ricomprato: chiuso')
  const rest = (await api.issues()).filter(i => i.load_out_id === lo && i.status === 'open' && i.kind === 'missing')
  await api.resolveIssues(rest.map(i => i.id), 'dismissed', 'prova')
  ok(!(await api.issues()).some(i => i.load_out_id === lo && i.status === 'open'), `"Ignora tutti": ${rest.length} voci chiuse insieme`)
  ok((await api.activityLog(lo)).some(l => l.message === 'Leonardo ha confermato PERSO «Ukulele» — da ricomprare'), 'registro: perso confermato')

  console.log(failed ? `\n${failed} TEST FALLITI` : '\nTUTTI I TEST DELLA DEMO SUPERATI')
  return failed
}
