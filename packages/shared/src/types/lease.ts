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
  sent_for_signature_at: string | null
  collect_last_months_rent?: boolean
  created_at: string
  // Optional embed when the lease is fetched with property info — used by the
  // tenant dashboard to show "Property name · Unit X".
  unit?: {
    unit_number: string | null
    properties?: {
      name: string | null
      address: string | null
      city: string | null
      state: string | null
      zip: string | null
    } | null
  } | null
}
