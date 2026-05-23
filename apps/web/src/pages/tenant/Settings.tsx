import { useEffect, useState } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { Mail, Bell, Loader2, CheckCircle2, UserCircle, IdCard } from 'lucide-react'
import toast from 'react-hot-toast'
import ImageUploader from '../../components/shared/ImageUploader'

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
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [bio, setBio] = useState<BioForm>(EMPTY_BIO)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingBio, setSavingBio] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('notification_email_enabled, full_name, phone, avatar_url, date_of_birth, employer, employer_phone, monthly_income, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, previous_address, about_me')
        .eq('id', profile.id)
        .single()
      if (cancelled) return
      setEmailEnabled(data?.notification_email_enabled ?? true)
      setFullName(data?.full_name ?? '')
      setPhone(data?.phone ?? '')
      setAvatarUrl(data?.avatar_url ?? null)
      setBio({
        date_of_birth: data?.date_of_birth ?? '',
        employer: data?.employer ?? '',
        employer_phone: data?.employer_phone ?? '',
        monthly_income: data?.monthly_income != null ? String(data.monthly_income) : '',
        emergency_contact_name: data?.emergency_contact_name ?? '',
        emergency_contact_phone: data?.emergency_contact_phone ?? '',
        emergency_contact_relationship: data?.emergency_contact_relationship ?? '',
        previous_address: data?.previous_address ?? '',
        about_me: data?.about_me ?? '',
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile?.id])

  const saveBio = async () => {
    if (!profile?.id) return
    setSavingBio(true)
    const { error } = await supabase.from('profiles').update({
      date_of_birth: bio.date_of_birth || null,
      employer: bio.employer.trim() || null,
      employer_phone: bio.employer_phone.trim() || null,
      monthly_income: bio.monthly_income ? Number(bio.monthly_income) : null,
      emergency_contact_name: bio.emergency_contact_name.trim() || null,
      emergency_contact_phone: bio.emergency_contact_phone.trim() || null,
      emergency_contact_relationship: bio.emergency_contact_relationship.trim() || null,
      previous_address: bio.previous_address.trim() || null,
      about_me: bio.about_me.trim() || null,
    }).eq('id', profile.id)
    setSavingBio(false)
    if (error) toast.error(error.message)
    else toast.success('Bio saved')
  }
  const setBioField = (k: keyof BioForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setBio((b) => ({ ...b, [k]: e.target.value }))

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
          <BioField label="Date of birth" type="date" value={bio.date_of_birth} onChange={setBioField('date_of_birth')} />
          <BioField label="Monthly income ($)" type="number" value={bio.monthly_income} onChange={setBioField('monthly_income')} placeholder="5000" />
          <BioField label="Employer" value={bio.employer} onChange={setBioField('employer')} placeholder="Acme Corp" />
          <BioField label="Employer phone" type="tel" value={bio.employer_phone} onChange={setBioField('employer_phone')} placeholder="555-555-5555" />
          <BioField label="Emergency contact" value={bio.emergency_contact_name} onChange={setBioField('emergency_contact_name')} placeholder="Jane Doe" />
          <BioField label="Emergency contact phone" type="tel" value={bio.emergency_contact_phone} onChange={setBioField('emergency_contact_phone')} placeholder="555-555-5555" />
          <BioField label="Relationship" value={bio.emergency_contact_relationship} onChange={setBioField('emergency_contact_relationship')} placeholder="Sister" />
          <BioField label="Previous address" value={bio.previous_address} onChange={setBioField('previous_address')} placeholder="123 Oak St, City, ST" />
        </div>

        <div className="mt-4">
          <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">About me</label>
          <textarea
            value={bio.about_me}
            onChange={setBioField('about_me')}
            rows={3}
            placeholder="Tell your landlord a bit about yourself — pets, work schedule, anything they should know."
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex justify-end mt-5">
          <button
            type="button"
            onClick={saveBio}
            disabled={savingBio}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {savingBio && <Loader2 className="w-4 h-4 animate-spin" />}
            Save bio
          </button>
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

function BioField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  )
}
