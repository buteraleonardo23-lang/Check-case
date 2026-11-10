import type {
  ActivityRow, Case, Closure, CloseResult, Item, ItemMove, LoadOut, PlaceResult, Profile, StatusRow,
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
  loadState(loadOutId: string): Promise<{ status: StatusRow[]; closures: Closure[] }>
  subscribe(loadOutId: string, onChange: () => void): () => void
  startLoadOut(): Promise<void>
  endLoadOut(loadOutId: string): Promise<void>
  place(loadOutId: string, itemId: string, caseId: string, move: boolean): Promise<PlaceResult>
  unplace(loadOutId: string, itemId: string): Promise<void>
  closeCase(loadOutId: string, caseId: string, o: { confirm?: boolean; force?: boolean; note?: string }): Promise<CloseResult>
  reopenCase(loadOutId: string, caseId: string): Promise<void>
  activity(loadOutId: string): Promise<ActivityRow[]>
  // catalogo (solo admin)
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
