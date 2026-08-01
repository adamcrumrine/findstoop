// One-time "create your password" step for anyone who arrived via an emailed
// invite / magic link.
//
// Why this exists: the emailed link is a BEARER token — whoever opens the
// message is signed in as that account. Before this screen, that link was the
// only key the tenant ever had, so any copy of the email (a forward, a shared
// inbox, a CC'd landlord) stayed a working login until the link expired.
// Setting a real password makes the link disposable.
//
// It keys off profiles.must_set_password rather than anything in the URL, so
// it also catches invite emails that were already delivered.

import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { checkPasswordStrength, hibpCheckPassword } from '../../lib/passwordSecurity'
import { defaultPathForRole } from '../../lib/roleRouting'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import PasswordInput from '../../components/shared/PasswordInput'
import { BRAND } from '../../lib/brand'
import { Lock, CheckCircle2, Loader2 } from 'lucide-react'

const inputClass = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink focus:border-transparent placeholder-mute'

export default function SetPassword() {
  const { user, profile, loading: authLoading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})

  if (authLoading) return <LoadingSpinner message="Loading…" />

  // No session — the link was already used or has expired. Send them to the
  // renter sign-in, which carries the "request a new link" path.
  if (!user) return <Navigate to="/login/renter?expired=1" replace />

  // Nothing to do — don't strand anyone on a screen they don't need.
  if (profile && !profile.must_set_password) {
    return <Navigate to={defaultPathForRole(profile.role)} replace />
  }

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: { password?: string; confirm?: string } = {}

    const strength = checkPasswordStrength(password, user.email ?? undefined)
    if (!strength.ok) next.password = strength.reason
    if (password !== confirm) next.confirm = 'Passwords don\'t match'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSaving(true)
    try {
      // Reject passwords known to be in breach corpora before committing.
      const breaches = await hibpCheckPassword(password).catch(() => 0)
      if (breaches > 0) {
        setErrors({ password: 'That password has appeared in a data breach — please choose another.' })
        setSaving(false)
        return
      }

      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw new Error(error.message)

      // Clear the flag so this screen never shows again for them.
      await supabase.from('profiles').update({ must_set_password: false }).eq('id', user.id)

      toast.success('Password saved — welcome!')
      // Hard navigation on purpose: the auth context has no profile-refresh
      // hook, so a client-side route change would carry the stale
      // must_set_password=true and bounce straight back to this screen.
      window.location.assign(defaultPathForRole(profile?.role ?? 'tenant'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your password')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src={BRAND.logo.square} alt={BRAND.name} className="w-12 h-12 object-contain mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-ink">Hi {firstName} — one quick step</h1>
          <p className="text-sm text-mute mt-1.5 leading-relaxed">
            Create a password so you can sign back in any time. The link that brought
            you here only works once.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">
              Create password
            </label>
            <PasswordInput
              className={inputClass}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })) }}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
            {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">
              Confirm password
            </label>
            <PasswordInput
              className={inputClass}
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })) }}
              placeholder="Type it again"
              autoComplete="new-password"
            />
            {errors.confirm && <p className="text-xs text-red-600 mt-1">{errors.confirm}</p>}
          </div>

          <button
            type="submit"
            disabled={saving || !password || !confirm}
            className="w-full inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> Saving…</>
            ) : (
              <><CheckCircle2 className="w-4 h-4" strokeWidth={2} /> Save and continue</>
            )}
          </button>

          <p className="text-[11px] text-mute text-center inline-flex items-center justify-center gap-1.5 w-full">
            <Lock className="w-3 h-3" strokeWidth={2} />
            Only you will know this password — your landlord can't see it.
          </p>
        </form>
      </div>
    </div>
  )
}
