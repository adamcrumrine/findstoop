import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile, UserRole } from '../types/profile'
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js'
import { AuthContext, type AuthState } from './authContext'

// ── Internal: the real auth state, instantiated ONCE inside <AuthProvider> ───
function useAuthState(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)
  const mounted = useRef(true)

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    return data
  }

  const ensureProfile = async (userId: string, email: string, meta: Record<string, string>): Promise<Profile> => {
    let profile = await fetchProfile(userId)
    const pendingRole = localStorage.getItem('pending_oauth_role') as UserRole | null

    if (!profile) {
      if (pendingRole) localStorage.removeItem('pending_oauth_role')
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          role: (meta.role as Profile['role']) ?? pendingRole ?? 'tenant',
          full_name: meta.full_name ?? meta.name ?? null,
          email,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data!
    }

    if (pendingRole && pendingRole !== profile.role) {
      const ageMs = Date.now() - new Date(profile.created_at).getTime()
      if (ageMs < 60_000) {
        const { data, error } = await supabase
          .from('profiles')
          .update({ role: pendingRole })
          .eq('id', userId)
          .select()
          .single()
        if (!error && data) profile = data
      }
      localStorage.removeItem('pending_oauth_role')
    }
    return profile!
  }

  useEffect(() => {
    mounted.current = true
    // Track last-handled user id to avoid double-fetching the profile when
    // both getSession and the INITIAL_SESSION auth event resolve.
    let lastHandledUserId: string | null = null

    const handleSession = async (session: Session | null, source: 'init' | 'event') => {
      if (!mounted.current) return
      const sessionUserId = session?.user?.id ?? null
      setUser(session?.user ?? null)

      if (!sessionUserId) {
        lastHandledUserId = null
        setProfile(null)
        if (source === 'init' && mounted.current) setLoading(false)
        return
      }

      if (lastHandledUserId === sessionUserId) {
        // Already loaded this user's profile; no need to refetch.
        if (source === 'init' && mounted.current) setLoading(false)
        return
      }
      lastHandledUserId = sessionUserId

      // Retry before giving up. This used to swallow the error and leave
      // profile null, which every route guard reads as "wrong role" — so one
      // flaky request on a page refresh bounced the user to the dashboard
      // instead of the page they were on. A tenant got sent to the MANAGER
      // dashboard, because defaultPathForRole(undefined) lands there.
      let lastErr: unknown = null
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!mounted.current) return
        try {
          if (session!.user.app_metadata?.provider === 'google') {
            const meta = (session!.user.user_metadata ?? {}) as Record<string, string>
            const reconciled = await ensureProfile(session!.user.id, session!.user.email ?? '', meta)
            if (mounted.current) { setProfile(reconciled); setProfileError(null) }
          } else {
            const p = await fetchProfile(session!.user.id)
            if (mounted.current) { setProfile(p); setProfileError(null) }
          }
          lastErr = null
          break
        } catch (err) {
          lastErr = err
          // Brief backoff — a refresh after a laptop wakes often catches the
          // network still coming up.
          if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
        }
      }
      if (lastErr && mounted.current) {
        // Allow this user to be re-attempted rather than short-circuited by
        // the lastHandledUserId guard on the next auth event.
        lastHandledUserId = null
        setProfileError(lastErr instanceof Error ? lastErr.message : 'Could not load your profile')
      }
      if (source === 'init' && mounted.current) setLoading(false)
    }

    // Initial session — runs in our own context, not under the GoTrue lock,
    // so awaiting Supabase queries here is safe.
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        await handleSession(session, 'init')
      } catch {
        if (mounted.current) setLoading(false)
      }
    })()

    // Auth state change — IMPORTANT: do NOT await Supabase queries directly
    // inside this callback. GoTrue holds a Web Lock while emitting events,
    // and any awaited supabase call from here can deadlock against it for
    // up to the lock timeout (~6s). Defer to a microtask so the lock is
    // released before we run queries.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      queueMicrotask(() => { void handleSession(session, 'event') })
    })

    return () => {
      mounted.current = false
      subscription.unsubscribe()
    }
  }, [])

  // ── Auth actions ──────────────────────────────────────────────────────────

  const signIn = async (email: string, password: string): Promise<Profile> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    const meta = (data.user.user_metadata ?? {}) as Record<string, string>
    const p = await ensureProfile(data.user.id, data.user.email ?? '', meta)
    setProfile(p)
    return p
  }

  const signUp = async (email: string, password: string, role: UserRole, fullName: string): Promise<void> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role, full_name: fullName },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    if (error) throw new Error(error.message)
  }

  const signInWithGoogle = async (role: UserRole): Promise<void> => {
    localStorage.setItem('pending_oauth_role', role)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
    if (error) {
      localStorage.removeItem('pending_oauth_role')
      throw new Error(error.message)
    }
  }

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const sendPasswordReset = async (email: string): Promise<void> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) throw new Error(error.message)
  }

  // ── MFA — TOTP (Supabase native) ─────────────────────────────────────────

  const getTotpChallenge = async (): Promise<{ factorId: string; challengeId: string }> => {
    const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors()
    if (factorsErr) throw new Error(factorsErr.message)
    const factor = factorsData.totp[0]
    if (!factor) throw new Error('No TOTP factor enrolled')

    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (challengeErr) throw new Error(challengeErr.message)

    return { factorId: factor.id, challengeId: challengeData.id }
  }

  const verifyTotp = async (factorId: string, challengeId: string, code: string): Promise<void> => {
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code })
    if (error) throw new Error(error.message)
  }

  // ── MFA — SMS / Voice (Twilio via edge functions) ────────────────────────

  const callEdge = async (fn: string, body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(err.error ?? 'Request failed')
    }
    return res.json()
  }

  const sendSmsCode = async (channel: 'sms' | 'call'): Promise<void> => {
    await callEdge('send-verification', { channel })
  }

  const verifySmsCode = async (code: string): Promise<void> => {
    await callEdge('check-verification', { code })
  }

  const verifyBackupCode = async (code: string): Promise<{ remaining: number }> => {
    return callEdge('verify-backup-code', { code })
  }

  // ── Idle auto-logout (30 minutes) ────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    const IDLE_MS = 30 * 60 * 1000
    let timer: ReturnType<typeof setTimeout> | null = null

    const reset = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        supabase.auth.signOut().catch(() => {})
      }, IDLE_MS)
    }

    const winEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const
    winEvents.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    document.addEventListener('visibilitychange', reset)
    reset()

    return () => {
      if (timer) clearTimeout(timer)
      winEvents.forEach((e) => window.removeEventListener(e, reset))
      document.removeEventListener('visibilitychange', reset)
    }
  }, [user])

  // Re-attempt the profile fetch for whoever is currently signed in. Given to
  // the error screen so a user can recover in place instead of being sent
  // somewhere else and losing the page they were on.
  const retryProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    setProfileError(null)
    try {
      const p = await fetchProfile(session.user.id)
      if (mounted.current) setProfile(p)
    } catch (err) {
      if (mounted.current) {
        setProfileError(err instanceof Error ? err.message : 'Could not load your profile')
      }
    }
  }

  return useMemo<AuthState>(() => ({
    user,
    profile,
    role: profile?.role ?? null,
    loading,
    profileError,
    retryProfile,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    sendPasswordReset,
    getTotpChallenge,
    verifyTotp,
    sendSmsCode,
    verifySmsCode,
    verifyBackupCode,
  }), [user, profile, loading, profileError])
}

// ── Provider — mount once at app root ────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState()
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
