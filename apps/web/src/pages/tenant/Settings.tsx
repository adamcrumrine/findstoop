import { useEffect, useState } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Mail, Bell, Loader2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TenantSettings() {
  const { profile } = useAuth()
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('notification_email_enabled')
        .eq('id', profile.id)
        .single()
      if (cancelled) return
      setEmailEnabled(data?.notification_email_enabled ?? true)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile?.id])

  const save = async (next: boolean) => {
    if (!profile?.id) return
    setSaving(true)
    const prior = emailEnabled
    setEmailEnabled(next)
    const { error } = await supabase
      .from('profiles')
      .update({ notification_email_enabled: next })
      .eq('id', profile.id)
    setSaving(false)
    if (error) {
      setEmailEnabled(prior)
      toast.error(error.message)
    } else {
      toast.success(next ? 'Email reminders turned on' : 'Email reminders turned off')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="text-sm text-mute mt-1">Manage how FindStoop reaches you about your rental.</p>
      </header>

      {/* Notifications */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">Notifications</h2>
        </div>

        <ToggleRow
          Icon={Mail}
          title="Email reminders"
          subtitle="Rent due reminders 3 days out, 1 day out, and on the due date. Late-fee notices if applicable. Lease-related notifications."
          enabled={emailEnabled}
          disabled={saving}
          onChange={save}
        />

        <p className="mt-5 text-xs text-mute leading-relaxed">
          Turning email off means you won't get rent reminders or late-fee notices.
          You'll still see everything in your tenant dashboard, and your landlord
          can still message you in-app. Account-critical emails (password resets,
          login codes) cannot be turned off.
        </p>
      </section>

      {/* Account info — read-only for now */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-mute mb-4">Account</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wider text-mute font-semibold">Email</dt>
            <dd className="text-ink mt-0.5">{profile?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-mute font-semibold">Name</dt>
            <dd className="text-ink mt-0.5">{profile?.full_name ?? '—'}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

interface ToggleRowProps {
  Icon: typeof Mail
  title: string
  subtitle: string
  enabled: boolean
  disabled: boolean
  onChange: (next: boolean) => void
}

function ToggleRow({ Icon, title, subtitle, enabled, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-ink inline-flex items-center gap-1.5">
            {title}
            {enabled && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" strokeWidth={2.5} />}
          </p>
          <p className="text-xs text-mute mt-0.5 leading-relaxed">{subtitle}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        disabled={disabled}
        aria-pressed={enabled}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
          enabled ? 'bg-brand-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  )
}
