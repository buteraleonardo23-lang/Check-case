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
export interface Activity {
  id: string; item_id: string; case_id: string; placed_by: string
  placed_at: string; removed_at: string | null
}
