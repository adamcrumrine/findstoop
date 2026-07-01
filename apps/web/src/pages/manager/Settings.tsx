import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  Mail, Bell, AlertTriangle, Loader2, CheckCircle2, DollarSign, Calendar,
  Landmark, ExternalLink, UserCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import ImageUploader from '../../components/shared/ImageUploader'
import RenterToolsShare from '../../components/manager/RenterToolsShare'
import { BRAND } from '../../lib/brand'

interface LandlordSettings {
  full_name: string
  company_name: string
  company_logo_url: string | null
  avatar_url: string | null
  notification_email_enabled: boolean
  late_fee_enabled: boolean
  late_fee_amount: number
  late_fee_grace_days: number
  late_fee_type: 'flat' | 'percent'
  late_fee_percent: number
}

interface ConnectState {
  hasAccount: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  onboardedAt: string | null
}

const defaults: LandlordSettings = {
  full_name: '',
  company_name: '',
  company_logo_url: null,
  avatar_url: null,
  notification_email_enabled: true,
  late_fee_enabled: false,
  late_fee_amount: 50,
  late_fee_grace_days: 5,
  late_fee_type: 'flat',
  late_fee_percent: 5,
}

export default function ManagerSettings() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [settings, setSettings] = useState<LandlordSettings>(defaults)
  const [loading, setLoading] = useState(true)
  const [savingNotif, setSavingNotif] = useState(false)
  const [savingFees, setSavingFees] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [connect, setConnect] = useState<ConnectState>({
    hasAccount: false, chargesEnabled: false, payoutsEnabled: false, onboardedAt: null,
  })
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, company_name, company_logo_url, avatar_url, notification_email_enabled, late_fee_enabled, late_fee_amount, late_fee_grace_days, late_fee_type, late_fee_percent, stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_connect_onboarded_at')
        .eq('id', profile.id)
        .single()
      if (cancelled) return
      if (data) {
        setSettings({
          full_name: data.full_name ?? '',
          company_name: data.company_name ?? '',
          company_logo_url: data.company_logo_url ?? null,
          avatar_url: data.avatar_url ?? null,
          notification_email_enabled: data.notification_email_enabled ?? true,
          late_fee_enabled: data.late_fee_enabled ?? false,
          late_fee_amount: Number(data.late_fee_amount ?? 50),
          late_fee_grace_days: data.late_fee_grace_days ?? 5,
          late_fee_type: (data.late_fee_type ?? 'flat') as 'flat' | 'percent',
          late_fee_percent: Number(data.late_fee_percent ?? 5),
        })
        setConnect({
          hasAccount: !!data.stripe_connect_account_id,
          chargesEnabled: data.stripe_connect_charges_enabled === true,
          payoutsEnabled: data.stripe_connect_payouts_enabled === true,
          onboardedAt: data.stripe_connect_onboarded_at ?? null,
        })
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile?.id, searchParams.get('connect')])

  // Return-from-onboarding feedback
  useEffect(() => {
    const flag = searchParams.get('connect')
    if (flag === 'done') {
      toast.success("You're back from Stripe — we'll confirm setup as soon as Stripe verifies you.")
      setSearchParams({}, { replace: true })
    } else if (flag === 'refresh') {
      toast('Onboarding link expired — click "Continue setup" to get a fresh one.', { icon: 'ℹ️' })
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-link', { body: {} })
      if (error) throw error
      if (data?.onboardingUrl) {
        window.location.href = data.onboardingUrl
        return
      }
      toast.error(data?.error ?? 'Could not start Stripe onboarding.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connect link failed')
    } finally {
      setConnecting(false)
    }
  }

  const saveProfile = async () => {
    if (!profile?.id) return
    setSavingProfile(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: settings.full_name.trim(),
        company_name: settings.company_name.trim() || null,
        company_logo_url: settings.company_logo_url,
        avatar_url: settings.avatar_url,
      })
      .eq('id', profile.id)
    setSavingProfile(false)
    if (error) toast.error(error.message)
    else toast.success('Profile saved')
  }

  const persistAvatar = async (url: string | null) => {
    setSettings((s) => ({ ...s, avatar_url: url }))
    if (!profile?.id) return
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
  }

  const persistLogo = async (url: string | null) => {
    setSettings((s) => ({ ...s, company_logo_url: url }))
    if (!profile?.id) return
    await supabase.from('profiles').update({ company_logo_url: url }).eq('id', profile.id)
  }

  const updateNotif = async (next: boolean) => {
    if (!profile?.id) return
    setSavingNotif(true)
    const prior = settings.notification_email_enabled
    setSettings((s) => ({ ...s, notification_email_enabled: next }))
    const { error } = await supabase
      .from('profiles')
      .update({ notification_email_enabled: next })
      .eq('id', profile.id)
    setSavingNotif(false)
    if (error) {
      setSettings((s) => ({ ...s, notification_email_enabled: prior }))
      toast.error(error.message)
    } else {
      toast.success(next ? 'Email notifications on' : 'Email notifications off')
    }
  }

  const saveFees = async () => {
    if (!profile?.id) return
    setSavingFees(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        late_fee_enabled: settings.late_fee_enabled,
        late_fee_amount: settings.late_fee_amount,
        late_fee_grace_days: settings.late_fee_grace_days,
        late_fee_type: settings.late_fee_type,
        late_fee_percent: settings.late_fee_percent,
      })
      .eq('id', profile.id)
    setSavingFees(false)
    if (error) toast.error(error.message)
    else toast.success('Late-fee rules saved')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="text-sm text-mute mt-1">Configure notifications and billing rules for your portfolio.</p>
      </header>

      {/* Profile */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <UserCircle className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">Profile</h2>
        </div>

        <div className="space-y-5">
          <ImageUploader
            currentUrl={settings.avatar_url}
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
              value={settings.full_name}
              onChange={(e) => setSettings((s) => ({ ...s, full_name: e.target.value }))}
              placeholder="Your name"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">Company name</label>
            <input
              type="text"
              value={settings.company_name}
              onChange={(e) => setSettings((s) => ({ ...s, company_name: e.target.value }))}
              placeholder="e.g. Acme Properties LLC (optional)"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-mute mt-1.5">Appears on tenant invites, lease docs, and the renter portal.</p>
          </div>

          <ImageUploader
            currentUrl={settings.company_logo_url}
            onChange={persistLogo}
            pathPrefix={`company-logos/${profile?.id}`}
            variant="square"
            size={72}
            label="Company logo"
          />

          <div className="flex justify-end pt-2">
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

      {/* Share renter tools (landlord co-brand) */}
      <RenterToolsShare companyName={settings.company_name} />

      {/* Notifications */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">Notifications</h2>
        </div>

        <div className="flex items-start justify-between gap-4 py-2">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-ink inline-flex items-center gap-1.5">
                Email notifications
                {settings.notification_email_enabled && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" strokeWidth={2.5} />
                )}
              </p>
              <p className="text-xs text-mute mt-0.5 leading-relaxed">
                Onboarding tips, billing alerts, and lease/maintenance summaries. Critical account emails always send.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateNotif(!settings.notification_email_enabled)}
            disabled={savingNotif}
            aria-pressed={settings.notification_email_enabled}
            className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
              settings.notification_email_enabled ? 'bg-brand-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                settings.notification_email_enabled ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      </section>

      {/* Stripe Connect — direct rent deposits */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Landmark className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">Direct rent deposits</h2>
        </div>
        <p className="text-sm text-mute mb-5">
          Connect your bank through Stripe to receive rent payments directly to your account.
          Until you do, rent flows through {BRAND.name} and we issue a payout — Connect is faster,
          shorter to settle, and lets you see deposits in your Stripe dashboard.
        </p>

        {connect.chargesEnabled && connect.payoutsEnabled ? (
          <div className="rounded-xl bg-green-50 border border-green-200 p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-700 mt-0.5 shrink-0" strokeWidth={1.75} />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-green-900">Bank connected · rent is deposited directly</p>
              <p className="text-green-800 mt-0.5 text-xs">
                Connected {connect.onboardedAt ? new Date(connect.onboardedAt).toLocaleDateString() : 'recently'}. New rent payments flow straight to your bank.
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="text-xs font-medium text-green-900 underline hover:no-underline disabled:opacity-50"
            >
              Update
            </button>
          </div>
        ) : connect.hasAccount ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" strokeWidth={1.75} />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-amber-900">Onboarding incomplete</p>
              <p className="text-amber-800 mt-0.5 text-xs">
                Your Stripe account exists but isn't yet ready to receive funds. Finish KYC to enable direct deposits.
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
              Continue setup
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-5 py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" strokeWidth={1.75} />}
            Connect bank account via Stripe
          </button>
        )}

        <p className="mt-3 text-xs text-mute leading-relaxed">
          Stripe handles the KYC (driver's license + bank routing) — usually 2-3 minutes. Your information stays with Stripe; {BRAND.name} only sees whether the account is active.
        </p>
      </section>

      {/* Late-fee rules */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">Late-fee rules</h2>
        </div>
        <p className="text-sm text-mute mb-5">
          When rent is unpaid past the grace window, {BRAND.name} automatically
          assesses a late fee on the tenant's balance and emails them a notice.
        </p>

        <div className="flex items-center justify-between mb-5 py-2 border-b border-gray-100">
          <div>
            <p className="font-medium text-ink">Enable late-fee automation</p>
            <p className="text-xs text-mute mt-0.5">Off by default. Turn on once your lease terms support it.</p>
          </div>
          <button
            type="button"
            onClick={() => setSettings((s) => ({ ...s, late_fee_enabled: !s.late_fee_enabled }))}
            aria-pressed={settings.late_fee_enabled}
            className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${
              settings.late_fee_enabled ? 'bg-brand-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                settings.late_fee_enabled ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>

        <fieldset disabled={!settings.late_fee_enabled} className={`grid sm:grid-cols-2 gap-5 ${!settings.late_fee_enabled ? 'opacity-50' : ''}`}>
          {/* Grace period */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">Grace period</label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={30}
                value={settings.late_fee_grace_days}
                onChange={(e) => setSettings((s) => ({ ...s, late_fee_grace_days: Number(e.target.value) }))}
                className="w-full pl-3 pr-16 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-mute inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" strokeWidth={1.75} />
                days
              </span>
            </div>
            <p className="text-xs text-mute mt-1.5">Days after the due date before a fee is assessed.</p>
          </div>

          {/* Fee type */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">Fee type</label>
            <div className="inline-flex w-full rounded-lg border border-gray-300 bg-white p-1">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, late_fee_type: 'flat' }))}
                className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  settings.late_fee_type === 'flat' ? 'bg-brand-500 text-white' : 'text-ink hover:bg-gray-50'
                }`}
              >
                Flat dollar
              </button>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, late_fee_type: 'percent' }))}
                className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  settings.late_fee_type === 'percent' ? 'bg-brand-500 text-white' : 'text-ink hover:bg-gray-50'
                }`}
              >
                % of rent
              </button>
            </div>
          </div>

          {/* Amount */}
          {settings.late_fee_type === 'flat' ? (
            <div>
              <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">Flat fee amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={settings.late_fee_amount}
                  onChange={(e) => setSettings((s) => ({ ...s, late_fee_amount: Number(e.target.value) }))}
                  className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">Percent of rent</label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={settings.late_fee_percent}
                  onChange={(e) => setSettings((s) => ({ ...s, late_fee_percent: Number(e.target.value) }))}
                  className="w-full pl-3 pr-9 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-mute text-sm">%</span>
              </div>
            </div>
          )}
        </fieldset>

        {settings.late_fee_enabled && (
          <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
            <span>
              Make sure your lease agreements allow this exact fee structure and
              grace period. State law also caps late fees in many places — check
              your state's rules before turning this on.
            </span>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={saveFees}
            disabled={savingFees}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {savingFees && <Loader2 className="w-4 h-4 animate-spin" />}
            Save late-fee rules
          </button>
        </div>
      </section>

      {/* Account info */}
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
          <div>
            <dt className="text-xs uppercase tracking-wider text-mute font-semibold">Role</dt>
            <dd className="text-ink mt-0.5 capitalize">{profile?.role ?? '—'}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
