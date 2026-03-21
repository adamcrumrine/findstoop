export type UserRole = 'manager' | 'tenant'

export interface Profile {
  id: string
  role: UserRole
  full_name: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  created_at: string
}
