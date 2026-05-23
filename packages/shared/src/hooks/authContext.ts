import { createContext } from 'react'
import type { Profile, UserRole } from '../types/profile'
import type { User } from '@supabase/supabase-js'

export interface AuthState {
  user: User | null
  profile: Profile | null
  role: UserRole | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<Profile>
  signUp: (email: string, password: string, role: UserRole, fullName: string) => Promise<void>
  signInWithGoogle: (role: UserRole) => Promise<void>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  // MFA — TOTP (Supabase native)
  getTotpChallenge: () => Promise<{ factorId: string; challengeId: string }>
  verifyTotp: (factorId: string, challengeId: string, code: string) => Promise<void>
  // MFA — SMS / voice (Twilio edge functions)
  sendSmsCode: (channel: 'sms' | 'call') => Promise<void>
  verifySmsCode: (code: string) => Promise<void>
  // MFA — backup codes
  verifyBackupCode: (code: string) => Promise<{ remaining: number }>
}

export const AuthContext = createContext<AuthState | null>(null)
