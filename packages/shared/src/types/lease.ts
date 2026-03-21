export type LeaseStatus = 'pending' | 'active' | 'expired' | 'terminated'

export interface Lease {
  id: string
  unit_id: string
  tenant_id: string
  start_date: string
  end_date: string
  rent_amount: number
  security_deposit: number | null
  pet_deposit: number | null
  utility_notes: string | null
  status: LeaseStatus
  signed_at: string | null
  document_url: string | null
  created_at: string
}
