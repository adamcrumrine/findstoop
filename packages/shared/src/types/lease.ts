export type LeaseStatus = 'pending' | 'active' | 'upcoming' | 'expired' | 'terminated'

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
  // TRUE when the tenancy has rolled past its end_date and continues on a
  // month-to-month basis (status stays 'active'). Set during portfolio
  // import; toggled at renewal/end-of-term workflows.
  month_to_month?: boolean
  // For month-to-month leases: when the manager records a tentative move-out
  // date (verbal notice from tenant, planned vacate, etc.). The lifecycle
  // cron fires move-out reminders based on this date, since the lease's
  // original end_date is in the past for any M2M tenancy.
  tentative_move_out_date?: string | null
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
