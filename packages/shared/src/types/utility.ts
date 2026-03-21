export type UtilityType = 'water' | 'gas' | 'electric' | 'trash' | 'internet' | 'other'
export type UtilityResponsibility = 'landlord' | 'tenant'
export type BillStatus = 'pending' | 'paid' | 'overdue'

export interface Utility {
  id: string
  unit_id: string
  type: UtilityType
  responsibility: UtilityResponsibility
  provider_name: string | null
  account_number: string | null
  created_at: string
}

export interface UtilityBill {
  id: string
  utility_id: string
  lease_id: string
  amount: number
  period_start: string
  period_end: string
  due_date: string
  paid_at: string | null
  status: BillStatus
  created_at: string
}
