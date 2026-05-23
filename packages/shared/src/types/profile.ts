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
  mfa_enabled: boolean
  mfa_method: MfaMethod
  subscription_complimentary?: boolean
  payment_complimentary?: boolean
  payment_method_setup_at?: string | null
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
  created_at: string
}
