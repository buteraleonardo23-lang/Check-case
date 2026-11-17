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
  ok(s.missing.length === s.total - s.placed - (s.checked_out?.length ?? 0) && s.missing.length === 40 /* 101 oggetti - 60 segnati - 1 fuori per evento */, `riepilogo: ${s.missing.length} non trovati`)
  ok(s.open_cases.includes('05') && !s.open_cases.includes('01'), 'riepilogo: case aperti elencati')
  ok(s.checked_out?.length === 1 && s.checked_out[0].name === 'Accordatore' && s.checked_out[0].event === 'Serata in Duomo',
    'riepilogo: l\'Accordatore è "fuori per Serata in Duomo", non "non trovato"')
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

  console.log('Smontaggio di prova')
  const openBefore = (await api.issues()).filter(i => i.status !== 'resolved').length
  const movesBefore = (await cat()).moves.filter(m => m.status === 'pending').length
  await api.startLoadOut(true)
  const t = (await cat()).loadOut!
  ok(t.is_test === true, 'Leonardo avvia uno smontaggio di PROVA')
  await as('diego')
  for (const i of (await cat()).items.slice(0, 30)) await api.place(t.id, i.id, i.expected_case_id!, false)
  await api.place(t.id, await id('Torcia frontale'), cid('09'), false)
  ok((await api.issues()).filter(i => i.status !== 'resolved').length === openBefore, 'in prova le voci "da sistemare" non cambiano')
  ok((await cat()).moves.filter(m => m.status === 'pending').length === movesBefore, 'in prova gli spostamenti decisi restano da fare')
  ok(await throws(() => api.discardTestLoadOut(t.id)), 'un operatore non può chiudere la prova')
  await as('leonardo')
  ok(await throws(() => api.endLoadOut(t.id)), 'una prova non si conclude col riepilogo')
  await api.discardTestLoadOut(t.id)
  ok((await cat()).loadOut === null && !(await api.loadOuts()).some(l => l.id === t.id), 'prova chiusa e cancellata')
  ok(!(await api.activityLog('all')).some(l => l.load_out_id === t.id)
    && (await api.activityLog('all')).some(l => l.action === 'test_discarded'), 'registro: resta solo "ha fatto uno smontaggio di prova"')

  console.log('Ho un altro evento')
  await as('diego')
  ok(await throws(() => api.checkoutItem('i02-5', null, 'Festa')), 'un operatore non può segnare oggetti presi')
  await as('leonardo')
  ok(await api.checkoutItem('i02-5', null, 'Festa privata') === 'ok', 'Leonardo prende la Macchina del fumo per «Festa privata»')
  ok(await api.checkoutItem('i02-5', null, 'Festa privata') === 'already_out', 'non si segna due volte')
  const outs = (await api.checkouts()).filter(k => !k.returned_at)
  ok(outs.length === 2 && outs.some(k => k.from_case_id === 'c02'), 'fuori: Accordatore e Macchina del fumo (dal case 02)')
  await api.returnCheckouts(outs.map(k => k.id), 'evento finito')
  ok(!(await api.checkouts()).some(k => !k.returned_at), '"Tutto rimesso": rientrati')
  ok((await api.activityLog('all')).some(l => l.message === 'Leonardo ha rimesso «Macchina del fumo» nel case 02 (evento finito)'), 'registro: rimesso')

  console.log('Cestino')
  await as('diego')
  ok(await throws(() => api.trashItem('i03-1')), 'un operatore non può eliminare')
  await as('leonardo')
  ok(await throws(() => api.deleteItemForever('i03-1')), '"per sempre" solo per oggetti nel cestino')
  const hist = (await api.activityLog('all')).length
  await api.trashItem('i03-1')
  ok(!(await cat()).items.some(i => i.id === 'i03-1') && (await api.trashedItems()).some(t => t.id === 'i03-1'), 'il Radiomicrofono 1 va nel cestino')
  ok(!(await api.loadState('lo-demo')).status.some(r => r.item_id === 'i03-1'), 'nel cestino: sparisce dagli smontaggi')
  await api.restoreItem('i03-1')
  ok((await cat()).items.find(i => i.id === 'i03-1')?.expected_case_id === 'c03', 'ripristinato nel case 03')
  ok((await api.loadState('lo-demo')).status.find(r => r.item_id === 'i03-1')?.status === 'green', 'ripristinato con il suo storico (era verde)')
  ok((await api.activityLog('all')).length === hist + 2, 'registro: cestino + ripristino')
  await api.trashItem('i03-1'); await api.trashItem('i03-2')
  await api.emptyTrash()
  ok(!(await api.trashedItems()).length && !(await cat()).items.some(i => i.id === 'i03-1'), '"Svuota cestino": eliminati per sempre')
  ok((await api.activityLog('all')).some(l => l.message.startsWith('Leonardo ha eliminato per sempre l\'oggetto «Radiomicrofono archetto 1»')), 'registro: eliminazione definitiva')

  console.log('Sottocase')
  await as('diego')
  ok(await throws(() => api.saveItem({ id: 'i10-1', name: 'Cassetta attrezzi', is_container: true })), 'un operatore non può creare sottocase')
  await as('leonardo')
  await api.saveItem({ name: 'Scatola cavi', aliases: [], expected_case_id: 'c09', is_container: true })
  const box = (await cat()).items.find(i => i.name === 'Scatola cavi')!.id
  for (const n of ['Cavi XLR (sacca)', 'Cavi DMX (sacca)', 'Forbici']) {
    const it = (await cat()).items.find(i => i.name === n)!
    await api.saveItem({ id: it.id, name: it.name, parent_item_id: box })
  }
  ok((await cat()).items.find(i => i.name === 'Forbici')?.expected_case_id === 'c09', 'le Forbici entrano nella scatola e vanno nel 09')
  ok(await throws(() => api.saveItem({ name: 'Scatola nella scatola', is_container: true, parent_item_id: box })), 'niente scatola dentro scatola')
  ok(await throws(() => api.trashItem(box)), 'una scatola piena non va nel cestino')
  await api.startLoadOut()
  const l2 = (await cat()).loadOut!.id
  await as('diego')
  let pr = await api.place(l2, box, 'c09', false)
  ok(pr.result === 'container_open' && pr.missing.length === 3, 'la scatola vuota non si mette nel case')
  await api.place(l2, await id('Cavi XLR (sacca)'), 'c09', false, box)
  await api.place(l2, await id('Cavi DMX (sacca)'), 'c09', false, box)
  await api.place(l2, await id('Forbici'), 'c09', false)
  ok((await st(l2, 'Forbici')).status === 'orange', 'Forbici nel case ma fuori dalla scatola: ARANCIONE')
  await api.place(l2, await id('Forbici'), 'c09', true, box)
  ok((await st(l2, 'Forbici')).status === 'green', 'rimesse nella scatola: VERDI')
  ok((await api.closeContainer(l2, box, {})).result === 'closed', 'scatola completa: chiusa')
  ok((await api.place(l2, await id('Nastro gaffer'), 'c09', false, box)).result === 'container_closed', 'scatola chiusa: non si aggiunge niente')
  ok((await api.place(l2, box, 'c09', false)).result === 'ok' && (await st(l2, 'Scatola cavi')).status === 'green', 'ora la scatola va nel case 09: VERDE')
  const cc = await api.closeCase(l2, 'c09', {})
  ok(cc.result === 'blocked' && !cc.missing.some(m => m.name === 'Cavi XLR (sacca)' || m.name === 'Scatola cavi'), 'case 09: la scatola conta come un oggetto')
  ok(await api.reopenContainer(l2, box) === 'ok' && (await st(l2, 'Scatola cavi')).status === 'red', 'riaprire la scatola la toglie dal case')
  const lg = await api.activityLog(l2)
  ok(lg.some(l => l.message === 'Diego ha messo «Cavi XLR (sacca)» nella «Scatola cavi» (case 09)'), 'registro: "… nella «Scatola cavi» (case 09)"')
  ok(lg.some(l => l.message === 'Diego ha messo «Forbici» nel case 09 (dovrebbe stare nella «Scatola cavi»)'), 'registro: "… (dovrebbe stare nella «Scatola cavi»)"')
  await as('leonardo')
  await api.moveItem(await id('Forbici'), 'c10', false, null)
  ok((await cat()).items.find(i => i.name === 'Forbici')?.parent_item_id === null, 'spostare le Forbici nel case 10 le toglie dalla scatola')
  await api.endLoadOut(l2)

  console.log(failed ? `\n${failed} TEST FALLITI` : '\nTUTTI I TEST DELLA DEMO SUPERATI')
  return failed
}
