export interface Property {
  id: string
  manager_id: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  thumbnail_url?: string | null
  created_at: string
  // Per-property screening preferences. Manager toggles which checks every
  // applicant to this property must complete (and pay for).
  require_selfie_screening: boolean
  require_credit_check: boolean
  require_criminal_check: boolean
  require_eviction_check: boolean
  require_credit_self_disclosed: boolean
  // Student / off-campus housing mode — landlord self-enables to give this
  // property's tenants the renter-help tools (lease explainer, rights, deposit
  // protection). No university partnership required.
  student_housing?: boolean
}
