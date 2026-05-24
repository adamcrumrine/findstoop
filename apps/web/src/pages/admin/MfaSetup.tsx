// Admin MFA setup — gates admin access until 2FA is on.
//
// Admin is effectively root on the platform. A leaked admin password alone
// shouldn't grant access — MFA is required by ProtectedRoute. This page is
// the bridge: it lets the admin add a phone number, verify a code, and flip
// `profiles.mfa_enabled=true`.
//
// Re-uses the existing send-verification + check-verification edge functions
// that the rest of the app already uses for the verification step.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ShieldCheck, Phone, ArrowRight, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'

const inputClass = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-mute'

export default function AdminMfaSetup() {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already done? Bounce them to the dashboard.
  if (profile?.mfa_enabled) {
    navigate('/admin/dashboard', { replace: true })
    return null
  }

  const handleSignOut = async () => {
    await signOut()
    // Hard-redirect so the React state fully resets — Navigate or
    // useNavigate can leave behind cached AuthProvider data on slow
    // promises, which causes the MFA-required redirect to fire again.
    window.location.href = '/login'
  }

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const cleaned = phone.replace(/[^\d+]/g, '')
    if (!cleaned.match(/^\+\d{10,15}$/)) {
      setError('Use E.164 format — e.g. +16145551234')
      return
    }
    setLoading(true)
    try {
      // Save the phone on the profile first (send-verification reads it from the row)
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ phone: cleaned, phone_last_four: cleaned.slice(-4) })
        .eq('id', user!.id)
      if (updErr) throw updErr

      // Send the SMS code
      const { error: sendErr } = await supabase.functions.invoke('send-verification', {
        body: { channel: 'sms' },
      })
      if (sendErr) throw sendErr

      toast.success('Code sent — check your phone')
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code')
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!code.match(/^\d{4,8}$/)) {
      setError('Enter the 6-digit code from the SMS')
      return
    }
    setLoading(true)
    try {
      const { data, error: verifyErr } = await supabase.functions.invoke('check-verification', {
        body: { code },
      })
      // Surface Twilio's actual reason (expired, canceled, wrong code, etc.)
      // so the user can act on it instead of staring at a generic error.
      if (verifyErr) {
        const ctx = verifyErr as { context?: { json?: () => Promise<Record<string, unknown>> } }
        let detail: Record<string, unknown> = {}
        try { detail = (await ctx.context?.json?.()) ?? {} } catch { /* ignore */ }
        const status = detail.twilio_status as string | undefined
        const msg    = (detail.error ?? detail.twilio_message) as string | undefined
        if (status === 'expired')  throw new Error('That code has expired — click "Send new code" to try again.')
        if (status === 'canceled') throw new Error('Verification was canceled. Click "Send new code" to start over.')
        throw new Error(msg || 'Code didn\'t verify. Double-check the digits or send a new code.')
      }
      if (!data?.success) {
        throw new Error('Code didn\'t verify. Double-check the digits or send a new code.')
      }
      // Flip MFA on
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ mfa_enabled: true, mfa_method: 'sms' })
        .eq('id', user!.id)
      if (updErr) throw updErr

      toast.success('MFA enabled — welcome in')
      // Hard reload so AuthProvider re-fetches the profile
      window.location.href = '/admin/dashboard'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  const resendCode = async () => {
    setError(null)
    setCode('')
    setLoading(true)
    try {
      const { error: sendErr } = await supabase.functions.invoke('send-verification', {
        body: { channel: 'sms' },
      })
      if (sendErr) throw sendErr
      toast.success('New code sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 w-full max-w-[440px] p-8">
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 inline-flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" strokeWidth={1.75} />
          </div>
          {/* Escape hatch — signed-in-but-stuck users need a way out */}
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 border border-slate-200 hover:border-slate-300 px-2.5 py-1 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
            Sign out
          </button>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Set up two-factor authentication</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          Admin accounts require 2FA — a leaked password alone shouldn't grant access to the
          platform. We'll text a verification code to your phone whenever you sign in.
        </p>
        {user?.email && (
          <p className="text-[11px] text-slate-400 mt-1.5">
            Signed in as <strong className="text-slate-600">{user.email}</strong>. Wrong account?{' '}
            <button type="button" onClick={handleSignOut} className="text-brand-600 hover:underline">Sign out</button>.
          </p>
        )}

        {step === 'phone' && (
          <form onSubmit={sendCode} className="mt-6 space-y-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
                Mobile phone (E.164 format)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" strokeWidth={1.75} />
                <input
                  className={`${inputClass} pl-9`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+16145551234"
                  required
                />
              </div>
              {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 rounded-lg disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
              {loading ? 'Sending…' : 'Send code'}
              {!loading && <ArrowRight className="w-4 h-4" strokeWidth={2} />}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={verifyCode} className="mt-6 space-y-3">
            <p className="text-xs text-slate-600">
              Code sent to <strong>{phone}</strong>.{' '}
              <button type="button" onClick={() => setStep('phone')} className="text-brand-600 hover:underline">
                Change number
              </button>
            </p>
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
                Verification code
              </label>
              <input
                className={inputClass}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="123456"
                inputMode="numeric"
                autoFocus
                required
              />
              {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 rounded-lg disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
              {loading ? 'Verifying…' : 'Verify + enable MFA'}
            </button>
            <button
              type="button"
              onClick={resendCode}
              disabled={loading}
              className="w-full text-xs text-brand-600 hover:text-brand-700 hover:underline py-1 disabled:opacity-50"
            >
              Send a new code
            </button>
          </form>
        )}

        <p className="text-[11px] text-slate-400 mt-6 text-center">
          Standard message rates apply. We use Twilio for SMS delivery.
        </p>
      </div>
    </div>
  )
}
