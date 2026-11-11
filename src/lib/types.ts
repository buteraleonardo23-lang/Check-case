export type Role = 'admin' | 'operator'
export type ItemStatus = 'green' | 'orange' | 'red'

export interface Profile { id: string; username: string; display_name: string; role: Role }
export interface Case {
  id: string; code: string; name: string; color: string | null
  photo_path: string | null; layout_photo_path: string | null; notes: string | null; sort_order: number
}
export interface Item {
  id: string; name: string; aliases: string[]; expected_case_id: string | null
  photo_path: string | null; notes: string | null
}
export interface LoadOut { id: string; started_at: string; status: 'open' | 'closed' }
export interface StatusRow {
  item_id: string; item_name: string; aliases: string[]
  expected_case_id: string | null; actual_case_id: string | null
  placed_by: string | null; placed_by_name: string | null; placed_at: string | null
  status: ItemStatus
}
export interface Closure {
  id: string; case_id: string; closed_by: string; closed_at: string; forced: boolean; note: string | null
}
export interface ActivityRow {
  id: string; item_id: string; case_id: string; by: string; placed_at: string; removed_at: string | null
}
/** Riassegnazione definitiva di un oggetto a un altro case (decisa da un admin). */
export interface ItemMove {
  id: string; item_id: string; from_case_id: string | null; to_case_id: string
  status: 'pending' | 'done'; note: string | null; created_at: string; created_by_name: string
}

export interface ListedItem { name: string; case_code?: string; by?: string }
export type PlaceResult =
  | { result: 'ok' | 'already_here' | 'case_closed' }
  | { result: 'conflict'; case_code: string; by: string; at: string }
export type CloseResult =
  | { result: 'closed' | 'already_closed'; elsewhere?: ListedItem[] }
  | { result: 'needs_confirm'; elsewhere: ListedItem[] }
  | { result: 'blocked'; missing: ListedItem[]; elsewhere: ListedItem[] }

/** Riepilogo di uno smontaggio, mostrato prima di concluderlo. */
export interface LoadOutSummary {
  misplaced: { item_id: string; name: string; expected_code: string | null; actual_code: string; by: string | null; at: string | null }[]
  missing: { item_id: string; name: string; expected_code: string | null }[]
  open_cases: string[]
  placed: number
  total: number
}

/** Voce "da sistemare" nata alla chiusura di uno smontaggio. */
export type IssueAction = 'fixed' | 'reassigned' | 'found' | 'lost' | 'replaced' | 'dismissed'
export interface LoadOutIssue {
  id: string; load_out_id: string; load_out_date: string; item_id: string
  kind: 'misplaced' | 'missing'
  expected_case_id: string | null; actual_case_id: string | null; placed_by_name: string | null
  status: 'open' | 'lost' | 'resolved'; resolution: Exclude<IssueAction, 'lost'> | null
  note: string | null; created_at: string; resolved_at: string | null
}

export interface LogRow { id: number; at: string; actor_name: string | null; action: string; message: string; load_out_id: string | null }
export interface LoadOutInfo { id: string; started_at: string; ended_at: string | null; status: 'open' | 'closed' }
