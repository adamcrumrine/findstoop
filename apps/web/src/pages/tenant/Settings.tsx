import { useEffect, useState } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Mail, Bell, Loader2, CheckCircle2, UserCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import ImageUploader from '../../components/shared/ImageUploader'

export default function TenantSettings() {
  const { profile } = useAuth()
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('notification_email_enabled, full_name, phone, avatar_url')
        .eq('id', profile.id)
        .single()
      if (cancelled) return
      setEmailEnabled(data?.notification_email_enabled ?? true)
      setFullName(data?.full_name ?? '')
      setPhone(data?.phone ?? '')
      setAvatarUrl(data?.avatar_url ?? null)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile?.id])

  const persistAvatar = async (url: string | null) => {
    setAvatarUrl(url)
    if (!profile?.id) return
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
  }

  const saveProfile = async () => {
    if (!profile?.id) return
    setSavingProfile(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), phone: phone.trim() || null })
      .eq('id', profile.id)
    setSavingProfile(false)
    if (error) toast.error(error.message)
    else toast.success('Profile saved')
  }

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
        <p className="text-sm text-mute mt-1">Your profile and how FindStoop reaches you.</p>
      </header>

      {/* Profile */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <UserCircle className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">Profile</h2>
        </div>

        <div className="space-y-5">
          <ImageUploader
            currentUrl={avatarUrl}
            onChange={persistAvatar}
            pathPrefix={`avatars/${profile?.id}`}
            variant="circle"
            size={72}
            label="Your photo"
          />

          <div>
            <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="555-555-5555"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={saveProfile}
              disabled={savingProfile}
              className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
              Save profile
            </button>
          </div>
        </div>
      </section>

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
