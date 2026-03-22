export type UserRole = 'manager' | 'tenant'
export type MfaMethod = 'sms' | 'totp' | 'none'

export interface Profile {
  id: string
  role: UserRole
  full_name: string | null
  email: string | null
  phone: string | null
  phone_last_four: string | null
  avatar_url: string | null
  mfa_enabled: boolean
  mfa_method: MfaMethod
  created_at: string
}
