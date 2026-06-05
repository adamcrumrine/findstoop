// Result shape for Renter Check — the tenant-side lease explainer.
// Produced by the explain-lease edge function (Claude) from an uploaded lease.

export type RedFlagSeverity = 'high' | 'medium' | 'low'

export interface LeaseAnalysis {
  summary: string
  state_detected: string | null // e.g. 'OH'; null if unclear
  parties: {
    landlord_name: string | null
    landlord_email: string | null
    property_address: string | null
    unit: string | null
    tenant_names: string[]
  }
  money: {
    monthly_rent: number | null
    deposit: number | null
    other_fees: Array<{ label: string; amount: number | null }>
    total_upfront: number | null
  }
  key_dates: {
    start: string | null // YYYY-MM-DD
    end: string | null
    rent_due_day: number | null
    notice_to_vacate_days: number | null
  }
  obligations: Array<{ title: string; plain_english: string; where_in_lease: string | null }>
  red_flags: Array<{
    severity: RedFlagSeverity
    issue: string
    why_it_matters: string
    state_context: string | null
    statute_cite: string | null // e.g. 'ORC 5321.16'
  }>
  your_rights: Array<{ right: string; plain_english: string; statute_cite: string | null }>
  questions_to_ask: string[]
}

export interface ExplainLeaseResponse {
  ok: boolean
  analysis?: LeaseAnalysis
  message?: string
  // Funnel handles (L2): present when the analysis was persisted.
  analysis_id?: string | null
  access_token?: string | null
  landlord_on_platform?: boolean
}
