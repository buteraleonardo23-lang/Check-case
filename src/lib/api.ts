import type {
  ActivityRow, Case, Checkout, ContainerClosure, TrashedCase, TrashedItem, Closure, CloseResult, IssueAction, Item, ItemMove, LoadOut, LoadOutInfo, LoadOutIssue,
  LoadOutSummary, LogRow, PlaceResult, Profile, StatusRow,
} from './types'

/**
 * Tutto l'accesso ai dati passa da qui. Due implementazioni:
 * - supabaseApi: produzione (regole applicate dalle RPC Postgres)
 * - demoApi: dati finti in memoria, stesse regole replicate in JS
 */
export interface Api {
  readonly demo: boolean
  // auth
  currentUser(): Promise<Profile | null>
  signIn(username: string, password: string): Promise<string | null>
  signOut(): Promise<void>
  onAuthChange(cb: () => void): () => void
  // smontaggio
  loadCatalog(): Promise<{ cases: Case[]; items: Item[]; loadOut: LoadOut | null; moves: ItemMove[] }>
  loadState(loadOutId: string): Promise<{ status: StatusRow[]; closures: Closure[]; containerClosures: ContainerClosure[] }>
  /** Ascolta SEMPRE le modifiche dei colleghi (anche senza smontaggio in corso).
   *  onStatus(true/false) dice se la connessione in tempo reale è attiva. */
  subscribe(onChange: () => void, onStatus?: (live: boolean) => void): () => void
  /** test=true: smontaggio di PROVA (si scarta alla fine, non tocca i dati veri) */
  startLoadOut(test?: boolean): Promise<void>
  /** Chiude la prova e cancella tutto quello segnato durante la prova. */
  discardTestLoadOut(loadOutId: string): Promise<void>
  /** Riepilogo prima di concludere (oggetti nel case sbagliato, non trovati, case aperti). */
  loadOutSummary(loadOutId: string): Promise<LoadOutSummary>
  /** Conclude lo smontaggio (solo admin) e crea le voci "da sistemare". */
  endLoadOut(loadOutId: string): Promise<LoadOutSummary>
  /** containerId: mette l'oggetto DENTRO quella scatola (sottocase) */
  place(loadOutId: string, itemId: string, caseId: string, move: boolean, containerId?: string | null): Promise<PlaceResult>
  unplace(loadOutId: string, itemId: string): Promise<void>
  closeCase(loadOutId: string, caseId: string, o: { confirm?: boolean; force?: boolean; note?: string }): Promise<CloseResult>
  reopenCase(loadOutId: string, caseId: string): Promise<void>
  closeContainer(loadOutId: string, containerId: string, o: { confirm?: boolean; force?: boolean; note?: string }): Promise<CloseResult>
  /** 'case_closed': la scatola è in un case chiuso, va riaperto prima il case */
  reopenContainer(loadOutId: string, containerId: string): Promise<'ok' | 'case_closed'>
  activity(loadOutId: string): Promise<ActivityRow[]>
  // da sistemare + registro
  issues(): Promise<LoadOutIssue[]>
  resolveIssues(issueIds: string[], action: IssueAction, note: string | null): Promise<void>
  activityLog(loadOutId: string | null | 'all', limit?: number): Promise<LogRow[]>
  loadOuts(): Promise<LoadOutInfo[]>
  // "Ho un altro evento" (solo admin)
  checkouts(): Promise<Checkout[]>
  checkoutItem(itemId: string, fromCaseId: string | null, eventName: string | null): Promise<'ok' | 'already_out'>
  returnCheckouts(ids: string[], note: string | null): Promise<void>
  // catalogo (solo admin)
  /** Cestino: "elimina" sposta qui, si può ripristinare. Solo "per sempre" cancella davvero. */
  trashItem(itemId: string): Promise<void>
  restoreItem(itemId: string): Promise<void>
  deleteItemForever(itemId: string): Promise<void>
  emptyTrash(): Promise<void>
  trashedItems(): Promise<TrashedItem[]>
  /** Cestino dei case: solo case VUOTI; si ripristinano, non si eliminano per sempre (lo storico resta). */
  trashCase(caseId: string): Promise<void>
  restoreCase(caseId: string): Promise<void>
  trashedCases(): Promise<TrashedCase[]>
  /** Aggiorna SOLO le foto "come è dentro" (non tocca nome/numero: altri possono modificarli nello stesso momento). */
  setCasePhotos(caseId: string, photos: string[]): Promise<void>
  /** Foto "come è dentro" di una scatola (solo quelle colonne). */
  setItemPhotos(itemId: string, photos: string[]): Promise<void>
  saveCase(c: Partial<Case> & { code: string; name: string }): Promise<void>
  saveItem(i: Partial<Item> & { name: string }): Promise<void>
  moveItem(itemId: string, toCaseId: string, pending: boolean, note: string | null): Promise<void>
  completeMove(moveId: string): Promise<void>
  // foto
  uploadPhoto(file: File): Promise<string>
  photoUrl(path: string): Promise<string | null>
}

import { supabaseConfigured } from './supabase'
import { supabaseApi } from './supabaseApi'
import { demoApi } from '../demo/demoApi'

export const isDemo = import.meta.env.VITE_DEMO === 'true' || !supabaseConfigured
export const api: Api = isDemo ? demoApi : supabaseApi
