import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Mail, Bell, BellRing, Loader2, CheckCircle2, UserCircle, IdCard, Lock, RefreshCw } from 'lucide-react'
import { pushSupported, pushSubscribed, subscribePush, unsubscribePush } from '../../lib/push'
import toast from 'react-hot-toast'
import ImageUploader from '../../components/shared/ImageUploader'
import { formatPhone, formatUsdCents, formatAddress } from '@findstoop/shared/lib/format'
import { BRAND } from '../../lib/brand'

interface BioForm {
  date_of_birth: string
  employer: string
  employer_phone: string
  monthly_income: string
  emergency_contact_name: string
  emergency_contact_phone: string
  emergency_contact_relationship: string
  previous_address: string
  about_me: string
}

const EMPTY_BIO: BioForm = {
  date_of_birth: '', employer: '', employer_phone: '', monthly_income: '',
  emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
  previous_address: '', about_me: '',
}

export default function TenantSettings() {
  const { profile } = useAuth()
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [bio, setBio] = useState<BioForm>(EMPTY_BIO)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [, setSavingProfile] = useState(false)
  const [, setSavingBio] = useState(false)
  // Once the tenant has a submitted rental application, fields the
  // application captured become locked here. The application is the
  // system of record for those values — changes route through the
  // landlord (e.g., updating an emergency contact via Settings, but
  // calling the manager to correct a typo in date_of_birth).
  const [fromApplication, setFromApplication] = useState(false)
  // Snapshots of the last-persisted values. Auto-save compares current
  // form state against these and skips the network round-trip + toast
  // if nothing actually changed.
  const lastSavedProfile = useRef<{ fullName: string; phone: string; smsEnabled: boolean } | null>(null)
  const lastSavedBio = useRef<BioForm | null>(null)
  // Toast-debounce — coalesces multiple rapid saves into one "Saved"
  // toast over the 2-second window.
  const toastDebounce = useRef<number | null>(null)

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(false)
      try {
        const { data, error: profileErr } = await supabase
          .from('profiles')
          .select('notification_email_enabled, notification_sms_enabled, full_name, phone, avatar_url, date_of_birth, employer, employer_phone, monthly_income, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, previous_address, about_me')
          .eq('id', profile.id)
          .single()
        if (profileErr) throw profileErr
        if (cancelled) return
        setEmailEnabled(data?.notification_email_enabled ?? true)
        const loadedSms      = data?.notification_sms_enabled ?? false
        const loadedFullName = data?.full_name ?? ''
        const loadedPhone    = formatPhone(data?.phone ?? '') || ''
        setSmsEnabled(loadedSms)
        setFullName(loadedFullName)
        setPhone(loadedPhone)
        lastSavedProfile.current = { fullName: loadedFullName, phone: loadedPhone, smsEnabled: loadedSms }
        // Has a submitted application? If so, app-sourced fields lock.
        const { data: appRow, error: appErr } = await supabase
          .from('applications')
          .select('id')
          .eq('applicant_profile_id', profile.id)
          .not('submitted_at', 'is', null)
          .limit(1)
          .maybeSingle()
        if (appErr) throw appErr
        if (!cancelled) setFromApplication(!!appRow)
        setAvatarUrl(data?.avatar_url ?? null)
        const loadedBio: BioForm = {
          date_of_birth: data?.date_of_birth ?? '',
          employer: data?.employer ?? '',
          employer_phone: formatPhone(data?.employer_phone ?? '') || data?.employer_phone || '',
          monthly_income: data?.monthly_income != null ? String(data.monthly_income) : '',
          emergency_contact_name: data?.emergency_contact_name ?? '',
          emergency_contact_phone: formatPhone(data?.emergency_contact_phone ?? '') || data?.emergency_contact_phone || '',
          emergency_contact_relationship: data?.emergency_contact_relationship ?? '',
          previous_address: formatAddress(data?.previous_address ?? ''),
          about_me: data?.about_me ?? '',
        }
        setBio(loadedBio)
        lastSavedBio.current = loadedBio
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [profile?.id, retryCount])

  const saveBio = async () => {
    if (!profile?.id) return
    // Skip the round-trip when nothing has actually changed since the
    // last persisted snapshot. Inline compare to avoid TDZ issues with
    // helpers declared later in the component body.
    if (lastSavedBio.current) {
      const prev = lastSavedBio.current
      const same = (Object.keys(bio) as Array<keyof BioForm>).every((k) => prev[k] === bio[k])
      if (same) return
    }
    setSavingBio(true)
    // Persist raw digits for phone fields, formatted/whitespace-trimmed
    // for the rest. UI re-applies the (###) ###-#### mask on load.
    const stripPhone = (s: string) => s.replace(/\D/g, '') || null
    const { error } = await supabase.from('profiles').update({
      date_of_birth: bio.date_of_birth || null,
      employer: bio.employer.trim() || null,
      employer_phone: stripPhone(bio.employer_phone),
      monthly_income: bio.monthly_income ? Number(bio.monthly_income) : null,
      emergency_contact_name: bio.emergency_contact_name.trim() || null,
      emergency_contact_phone: stripPhone(bio.emergency_contact_phone),
      emergency_contact_relationship: bio.emergency_contact_relationship.trim() || null,
      previous_address: bio.previous_address.trim() || null,
      about_me: bio.about_me.trim() || null,
    }).eq('id', profile.id)
    setSavingBio(false)
    if (error) { toast.error(error.message); return }
    lastSavedBio.current = bio
    toastSaved()
  }
  const setBioField = (k: keyof BioForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setBio((b) => ({ ...b, [k]: e.target.value }))


  const persistAvatar = async (url: string | null) => {
    setAvatarUrl(url)
    if (!profile?.id) return
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
  }

  // Coalesces multiple rapid saves into a single "Saved" toast. The
  // 1.5s debounce window catches Profile + Bio saves landing in the
  // same edit burst (since both auto-save useEffects can fire on the
  // same field-change), so the user sees one confirmation, not two.
  const toastSaved = () => {
    if (toastDebounce.current != null) window.clearTimeout(toastDebounce.current)
    toastDebounce.current = window.setTimeout(() => {
      toast.success('Saved', { duration: 2000, icon: '✓' })
      toastDebounce.current = null
    }, 200)
  }

  const saveProfile = async () => {
    if (!profile?.id) return
    // No-op when the local state matches the last-persisted snapshot.
    if (lastSavedProfile.current
        && lastSavedProfile.current.fullName  === fullName
        && lastSavedProfile.current.phone     === phone
        && lastSavedProfile.current.smsEnabled === smsEnabled) {
      return
    }
    setSavingProfile(true)
    // Strip formatting before persisting — DB stores raw digits; the UI
    // re-applies the (###) ###-#### mask on display.
    const cleanPhone = phone.replace(/\D/g, '') || null
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: cleanPhone,
        // SMS opt-in only makes sense with a phone on file; if the
        // tenant clears their phone, clear the flag with it.
        notification_sms_enabled: cleanPhone ? smsEnabled : false,
      })
      .eq('id', profile.id)
    setSavingProfile(false)
    if (error) { toast.error(error.message); return }
    lastSavedProfile.current = { fullName, phone, smsEnabled }
    toastSaved()
  }

  // Debounced auto-save for the Profile section (full name / phone /
  // SMS opt-in). Skips the initial mount load and any save while a
  // request is already in flight.
  useEffect(() => {
    if (loading || !profile?.id) return
    const t = window.setTimeout(() => { void saveProfile() }, 800)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, phone, smsEnabled])

  // Debounced auto-save for the Bio section. Same pattern.
  useEffect(() => {
    if (loading || !profile?.id) return
    const t = window.setTimeout(() => { void saveBio() }, 800)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bio])

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

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-sm font-medium text-ink">Couldn't load your settings.</p>
          <p className="text-xs text-mute mt-1">Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => setRetryCount((c) => c + 1)}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink bg-white border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
            Check again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="text-sm text-mute mt-1">Your profile and how {BRAND.name} reaches you.</p>
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
            <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5 inline-flex items-center gap-1">
              Full name
              {fromApplication && <Lock className="w-3 h-3 text-mute" strokeWidth={2} />}
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={fromApplication}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-mute"
            />
            {fromApplication && (
              <p className="text-[11px] text-mute mt-1">From your rental application — contact your landlord to correct.</p>
            )}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5 inline-flex items-center gap-1">
              Phone
              {fromApplication && <Lock className="w-3 h-3 text-mute" strokeWidth={2} />}
            </label>
            <input
              type="tel"
              value={phone}
              // Re-format on blur to (###) ###-#### so the value the user
              // sees always matches what we'll save. Editing leaves the
              // raw text in place so the cursor doesn't jump.
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => {
                const formatted = formatPhone(phone)
                if (formatted) setPhone(formatted)
              }}
              disabled={fromApplication}
              placeholder="(555) 555-5555"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-mute"
            />
            {fromApplication && (
              <p className="text-[11px] text-mute mt-1">From your rental application — contact your landlord to correct.</p>
            )}
            {/* SMS opt-in only enables when a phone is on file. Saved
                alongside the phone number via Save profile. */}
            <label className="mt-2 flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={smsEnabled}
                disabled={!phone.trim()}
                onChange={(e) => setSmsEnabled(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
              />
              <span className="text-xs">
                <span className="font-medium text-ink">Send me text-message reminders</span>
                <span className="block text-mute mt-0.5">
                  Rent due, payment failures, and urgent maintenance updates. Standard message rates apply.
                </span>
              </span>
            </label>
          </div>

          {/* No Save button — changes auto-save with a brief 1s "Saved" toast. */}
        </div>
      </section>

      {/* Tenant bio */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <IdCard className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">About you</h2>
        </div>
        <p className="text-xs text-mute mb-4">
          Optional. Your landlord can see this on your tenant profile — useful for emergency contacts,
          employer verification, and general background. Skip anything you don't want to share.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* App-sourced — locked when there's a submitted application. */}
          <BioField
            label="Date of birth"
            type="date"
            value={bio.date_of_birth}
            onChange={setBioField('date_of_birth')}
            disabled={fromApplication}
            helper={fromApplication ? 'From your rental application' : undefined}
          />
          <BioField
            label="Monthly income ($)"
            type="number"
            value={bio.monthly_income}
            onChange={setBioField('monthly_income')}
            placeholder="5,000"
            disabled={fromApplication}
            helper={fromApplication ? `From your rental application — ${formatUsdCents(Number(bio.monthly_income || 0))}` : undefined}
          />
          <BioField label="Employer" value={bio.employer} onChange={setBioField('employer')} placeholder="Acme Corp" />
          <BioField
            label="Employer phone"
            type="tel"
            value={bio.employer_phone}
            onChange={setBioField('employer_phone')}
            onBlur={() => setBio((b) => ({ ...b, employer_phone: formatPhone(b.employer_phone) || b.employer_phone }))}
            placeholder="(555) 555-5555"
          />
          <BioField label="Emergency contact" value={bio.emergency_contact_name} onChange={setBioField('emergency_contact_name')} placeholder="Jane Doe" />
          <BioField
            label="Emergency contact phone"
            type="tel"
            value={bio.emergency_contact_phone}
            onChange={setBioField('emergency_contact_phone')}
            onBlur={() => setBio((b) => ({ ...b, emergency_contact_phone: formatPhone(b.emergency_contact_phone) || b.emergency_contact_phone }))}
            placeholder="(555) 555-5555"
          />
          <BioField label="Relationship" value={bio.emergency_contact_relationship} onChange={setBioField('emergency_contact_relationship')} placeholder="Sister" />
          <BioField
            label="Previous address"
            value={bio.previous_address}
            onChange={setBioField('previous_address')}
            onBlur={() => setBio((b) => ({ ...b, previous_address: formatAddress(b.previous_address) }))}
            placeholder="123 Oak St, City, ST 12345"
            disabled={fromApplication}
            helper={fromApplication ? 'From your rental application' : undefined}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="bio-about-me" className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">About me</label>
          <textarea
            id="bio-about-me"
            value={bio.about_me}
            onChange={setBioField('about_me')}
            rows={3}
            placeholder="Tell your landlord a bit about yourself — pets, work schedule, anything they should know."
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
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

        <PushToggleRow profileId={profile?.id ?? null} />

        <p className="mt-5 text-xs text-mute leading-relaxed">
          Turning email off means you won't get rent reminders or late-fee notices.
          You'll still see everything in your tenant dashboard, and your landlord
          can still message you in-app. Account-critical emails (password resets,
          login codes) cannot be turned off.
        </p>
      </section>

      {/* Account info — read-only for now */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-mute mb-4">Account</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wider text-mute font-semibold">Email</dt>
            <dd className="text-ink mt-0.5 break-all">{profile?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-mute font-semibold">Name</dt>
            <dd className="text-ink mt-0.5">{profile?.full_name ?? '—'}</dd>
          </div>
        </dl>
      </section>

      {/* Privacy — pinned to the very bottom of the page. It's an
          infrequent control + data-use disclosure, so the position
          tells the reader "this is the fine-print area." */}
      <AnalyticsOptOut profileId={profile?.id ?? null} initial={!!profile?.analytics_opt_out} />
    </div>
  )
}

// Toggle wires straight to profiles.analytics_opt_out. The DB function
// extract_application_analytics() honors the flag and wipes any prior
// pseudonymized row on opt-in.
function AnalyticsOptOut({ profileId, initial }: { profileId: string | null; initial: boolean }) {
  const [optOut, setOptOut] = useState(initial)
  const [saving, setSaving] = useState(false)

  const handleToggle = async (next: boolean) => {
    if (!profileId) return
    setSaving(true)
    const prior = optOut
    setOptOut(next)
    const { error } = await supabase.from('profiles').update({ analytics_opt_out: next }).eq('id', profileId)
    setSaving(false)
    if (error) {
      setOptOut(prior)
      toast.error(error.message)
      return
    }
    toast.success(next ? 'Opted out of analytics.' : 'Analytics re-enabled.')
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-mute mb-1">Privacy</h2>
      <p className="text-xs text-mute mb-4 leading-relaxed">
        We store a pseudonymized, bucketed copy of your application + screening data to improve our AI scoring
        models. Names, exact addresses, and document files are never copied. See our{' '}
        <Link to="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link> for the full picture.
      </p>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={optOut}
          disabled={saving}
          onChange={(e) => handleToggle(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-sm">
          <span className="font-medium text-ink">Opt out of analytics extraction</span>
          <span className="block text-xs text-mute mt-0.5">
            Turning this on stops new data from being extracted and deletes any prior pseudonymized rows.
          </span>
        </span>
      </label>
    </section>
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

// Push notifications for THIS device. Hidden entirely when the browser can't
// do web push (old Safari, some in-app webviews) — a dead toggle is worse
// than no toggle. Denied permission shows how to fix it rather than failing
// silently.
function PushToggleRow({ profileId }: { profileId: string | null }) {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const supported = pushSupported()

  useEffect(() => {
    if (!supported) return
    void pushSubscribed().then(setEnabled)
  }, [supported])

  if (!supported) return null

  const handleChange = async (next: boolean) => {
    if (!profileId || busy) return
    setBusy(true)
    if (next) {
      const result = await subscribePush(profileId)
      if (result === 'subscribed') {
        setEnabled(true)
        toast.success('Push notifications on for this device')
      } else if (result === 'denied') {
        toast.error('Notifications are blocked for this site — allow them in your browser settings, then try again.')
      } else {
        toast.error('Could not enable push notifications on this device.')
      }
    } else {
      await unsubscribePush()
      setEnabled(false)
      toast.success('Push notifications off for this device')
    }
    setBusy(false)
  }

  return (
    <ToggleRow
      Icon={BellRing}
      title="Push notifications"
      subtitle="Payment receipts and failures, maintenance updates, and new documents — delivered to this device even when the app is closed."
      enabled={enabled}
      disabled={busy}
      onChange={handleChange}
    />
  )
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

function BioField({
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  placeholder,
  disabled,
  helper,
}: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBlur?: () => void
  type?: string
  placeholder?: string
  disabled?: boolean
  helper?: string
}) {
  // Stable id derived from the label — associates the <label> with its
  // <input> for screen readers (e.g. "Emergency contact phone" → "emergency-contact-phone").
  const id = `bio-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`
  return (
    <div>
      <label htmlFor={id} className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5 inline-flex items-center gap-1">
        {label}
        {disabled && <Lock className="w-3 h-3 text-mute" strokeWidth={2} />}
      </label>
      <input
        id={id}
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-mute"
      />
      {helper && <p className="text-[11px] text-mute mt-1">{helper}</p>}
    </div>
  )
}
