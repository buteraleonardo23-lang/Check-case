// Dati inventati per la demo: 10 case, 100 oggetti.
import type { Case, Item, Profile } from '../lib/types'

const imgs = import.meta.glob('./img/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const img = (n: number) => imgs[`./img/p${n}.jpg`] ?? null

export const demoUsers: (Profile & { hint: string })[] = [
  { id: 'u-leonardo', username: 'leonardo', display_name: 'Leonardo', role: 'admin', hint: 'Admin' },
  { id: 'u-matteo', username: 'matteo', display_name: 'Matteo', role: 'admin', hint: 'Admin' },
  { id: 'u-lorenzo', username: 'lorenzo', display_name: 'Lorenzo', role: 'operator', hint: 'Operatore' },
  { id: 'u-rossana', username: 'rossana', display_name: 'Rossana', role: 'operator', hint: 'Operatrice' },
  { id: 'u-diego', username: 'diego', display_name: 'Diego', role: 'operator', hint: 'Operatore' },
]

type Def = [code: string, name: string, color: string, photo: number, layout: number, notes: string, items: (string | [string, string[], number?])[]]

const defs: Def[] = [
  ['01', 'Audio', '#0BB9EA', 6, 1, 'Mixer sempre in alto, imbottitura blu sotto.', [
    ['Mixer digitale', ['banco', 'console audio', 'mixer']], ['Stagebox 16 canali', ['stagebox', 'ciabatta audio']],
    ['Cuffie regia', ['cuffie', 'cuffia grande'], 9], 'Interfaccia audio USB', ['Casse monitor (coppia)', ['spie', 'monitor'], 10],
    'Splitter DI x4', 'Alimentatore mixer', 'Router Wi-Fi regia', ['Tablet regia audio', ['ipad audio', 'tablet'], 18], 'Custodia chiavette USB']],
  ['02', 'Luci', '#F5C542', 3, 23, 'Teste mobili nelle sagome, barre LED sul fondo.', [
    ['Testa mobile SX', ['testa 1', 'moving sinistra']], ['Testa mobile DX', ['testa 2', 'moving destra']],
    ['Barra LED 1', ['barra 1']], ['Barra LED 2', ['barra 2']], 'Macchina del fumo', 'Liquido fumo (tanica)',
    'Controller DMX', ['Seguipersona piccolo', ['occhio di bue', 'follow spot']], 'Gelatine colorate', 'Ganci e sicure']],
  ['03', 'Microfoni', '#B583FF', 7, 14, 'Ogni radiomicrofono nella sua sagoma numerata.', [
    ['Radiomicrofono archetto 1', ['archetto leo', 'headset 1']], ['Radiomicrofono archetto 2', ['archetto 2', 'headset 2']],
    ['Microfono gelato', ['gelato', 'shure'], 17], ['Microfono vintage', ['microfono anni 50', 'retrò'], 17],
    'Ricevitore radiomicrofoni', 'Asta microfono', 'Pinze microfono', 'Batterie AA (scatola)', 'Antenne ricevitore', 'Spugnette antivento']],
  ['04', 'Strumenti', '#FF7A45', 21, 1, 'Chitarre in verticale, sax nella sua custodia.', [
    ['Chitarra acustica', ['chitarra', 'acustica'], 21], ['Sassofono contralto', ['sax'], 20], 'Ukulele',
    ['Tastiera 61 tasti', ['tastiera', 'piano'], 19], 'Supporto tastiera', 'Leggio', 'Capotasto e plettri',
    'Cavo jack chitarra', 'Accordatore', 'Ance sax (astuccio)']],
  ['05', 'Magia', '#FF3B6B', 26, 14, 'Il baule dei trucchi: NON aprire davanti al pubblico.', [
    ['Scatola rossa', ['scatola magica', 'box rosso', 'cassetta rossa']], ['Mazzo carte truccato', ['carte', 'mazzo leo']],
    ['Cilindro', ['cappello', 'tuba']], 'Bacchetta magica', ['Anelli cinesi', ['anelli']], 'Foulard colorati',
    ['Palloncini blu (busta)', ['palloncini', 'balloon']], 'Corda tagliata e ricomposta', 'Bicchieri e palline', 'Busta delle previsioni']],
  ['06', 'Scenografia', '#E23A3A', 12, 23, 'Pannelli in fondo, piedini avvitati a parte.', [
    ['Pannello fondale 1', ['fondale 1']], ['Pannello fondale 2', ['fondale 2']], 'Piedini pannelli (sacca)',
    ['Sipario rosso piccolo', ['tendina', 'sipario']], 'Sgabello alto', 'Tavolino magia', 'Tappeto scena',
    'Appendiabiti scena', 'Cornice vuota', 'Insegna luminosa NSS']],
  ['07', 'Costumi', '#E86BD8', 23, 1, 'Giacca rossa sempre appesa nella sacca, mai piegata.', [
    ['Giacca rossa', ['giacca leo', 'giacca di scena']], 'Camicia nera', 'Pantaloni neri', 'Papillon',
    'Scarpe di scena', 'Cappotto lungo', 'Kit trucco', 'Spazzola vestiti', 'Ferro da stiro da viaggio', 'Grucce (6)']],
  ['08', 'Video', '#4ADE80', 30, 14, 'Proiettore al centro, ottica smontata.', [
    ['Proiettore', ['videoproiettore', 'proiettore']], 'Ottica proiettore', ['Videocamera', ['camera', 'telecamera'], 30],
    'Treppiede', ['Laptop video', ['computer video', 'mac video'], 25], 'Telecomando slide', 'Cavo HDMI 15m',
    'Convertitore HDMI-SDI', 'Monitor di servizio', 'Hard disk backup']],
  ['09', 'Cavi e corrente', '#94A3B8', 25, 23, 'Cavi arrotolati over-under, fascette in velcro.', [
    ['Prolunga 25m', ['prolunga lunga', 'rullo']], 'Prolunga 10m', 'Ciabatte (x4)', 'Cavi XLR (sacca)',
    'Cavi DMX (sacca)', 'Cavi powercon', 'Multipresa con interruttore', 'Adattatori Schuko', 'Nastro gaffer', 'Fascette velcro']],
  ['10', 'Attrezzeria', '#38BDF8', 14, 1, 'Tutto quello che non sta altrove.', [
    ['Cassetta attrezzi', ['attrezzi', 'box attrezzi']], ['Smartphone di scena', ['telefono', 'cellulare'], 24],
    'Torcia frontale', 'Forbici', 'Pennarelli e scotch carta', 'Kit pronto soccorso', 'Scaletta cartacea',
    'Walkie-talkie (x3)', 'Asciugamani', 'Bottiglie acqua']],
]

export const demoCases: Case[] = defs.map(([code, name, color, photo, layout, notes], i) => ({
  id: `c${code}`, code, name, color, photo_path: img(photo), layout_photo_path: img(layout), notes, sort_order: i + 1,
}))

export const demoItems: Item[] = defs.flatMap(([code, , , , , , items]) =>
  items.map((d, j) => {
    const [name, aliases, photo] = typeof d === 'string' ? [d, [], undefined] : d
    return {
      id: `i${code}-${j + 1}`, name, aliases, expected_case_id: `c${code}`,
      photo_path: photo ? img(photo) : null, notes: null,
    }
  }),
)
