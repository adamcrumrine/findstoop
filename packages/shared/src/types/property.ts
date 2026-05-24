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
}
