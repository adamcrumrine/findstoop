export type UserRole = 'manager' | 'tenant' | 'admin'
export type MfaMethod = 'sms' | 'totp' | 'none'

export interface Profile {
  id: string
  role: UserRole
  full_name: string | null
  email: string | null
  phone: string | null
  phone_last_four: string | null
  avatar_url: string | null
  company_name: string | null
  company_address: string | null
  company_logo_url: string | null
  /** Landlord accent color as 6-digit hex ("#2E5984"); null = default palette. Tenants see it on their portal. */
  brand_color?: string | null
  mfa_enabled: boolean
  mfa_method: MfaMethod
  subscription_complimentary?: boolean
  payment_complimentary?: boolean
  payment_method_setup_at?: string | null
  autopay_enabled?: boolean
  /** TRUE when the account was reached via an emailed invite/magic link and
   *  no password has been chosen yet — the app forces /set-password until
   *  it's cleared. See migration 20260801000003. */
  must_set_password?: boolean
  // Tenant-bio fields — tenant self-fills from Settings; manager sees on tenant detail.
  date_of_birth?: string | null
  employer?: string | null
  employer_phone?: string | null
  monthly_income?: number | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  emergency_contact_relationship?: string | null
  previous_address?: string | null
  about_me?: string | null
  // Privacy: opt-out of the pseudonymized analytics pipeline.
  analytics_opt_out?: boolean
  created_at: string
}
