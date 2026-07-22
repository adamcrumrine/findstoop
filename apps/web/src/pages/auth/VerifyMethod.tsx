import { useState } from 'react'
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import type { UserRole } from '@findstoop/shared/types/profile'
import toast from 'react-hot-toast'
import { Smartphone, Phone, ShieldCheck, KeyRound, type LucideIcon } from 'lucide-react'
import { BRAND } from '../../lib/brand'

interface MfaState {
  role: UserRole
  phoneLast4?: string
  factorId?: string
  challengeId?: string
}

type MethodId = 'sms' | 'call' | 'totp' | 'backup'

interface Method {
  id: MethodId
  Icon: LucideIcon
  title: string
  subtitle: string
}

export default function VerifyMethod() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as MfaState | null
  const { sendSmsCode } = useAuth()
  const [busy, setBusy] = useState<MethodId | null>(null)

  if (!state?.role) return <Navigate to="/login" replace />

  const methods: Method[] = [
    ...(state.phoneLast4
      ? [
          {
            id: 'sms' as MethodId,
            Icon: Smartphone,
            title: 'Text message (SMS)',
            subtitle: `Send a code to ••••••••${state.phoneLast4}`,
          },
          {
            id: 'call' as MethodId,
            Icon: Phone,
            title: 'Phone call',
            subtitle: `Call ••••••••${state.phoneLast4} with a code`,
          },
        ]
      : []),
    {
      id: 'totp',
      Icon: ShieldCheck,
      title: 'Authenticator app',
      subtitle: 'Use Google Authenticator or similar',
    },
    {
      id: 'backup',
      Icon: KeyRound,
      title: 'Backup code',
      subtitle: 'Use one of your saved backup codes',
    },
  ]

  const handleSelect = async (id: MethodId) => {
    if (busy) return
    setBusy(id)
    try {
      if (id === 'sms') {
        await sendSmsCode('sms')
        navigate('/verify', { state: { ...state, method: 'sms' } })
      } else if (id === 'call') {
        await sendSmsCode('call')
        navigate('/verify', { state: { ...state, method: 'call' } })
      } else if (id === 'totp') {
        navigate('/verify/totp', { state })
      } else {
        navigate('/verify/backup', { state })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send code')
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-[400px] p-8">

        <Link to="/" aria-label={`${BRAND.name} home`} className="block mb-6 hover:opacity-80 transition-opacity">
          <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-14 w-auto" />
        </Link>

        <h1 className="text-xl font-medium text-ink">Try another method</h1>
        <p className="text-sm text-mute mt-1 mb-6">
          Choose how you'd like to verify your identity.
        </p>

        <div className="space-y-2">
          {methods.map(({ id, Icon, title, subtitle }) => (
            <button
              key={id}
              onClick={() => handleSelect(id)}
              disabled={!!busy}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all disabled:opacity-60 ${
                busy === id
                  ? 'border-brand-400 bg-brand-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-lg flex-shrink-0">
                {busy === id ? (
                  <span className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin inline-block" />
                ) : (
                  <Icon className="w-5 h-5 text-ink" strokeWidth={1.75} />
                )}
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{title}</p>
                <p className="text-xs text-mute mt-0.5">{subtitle}</p>
              </div>
            </button>
          ))}
        </div>

        <p className="mt-6 text-center">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-mute-400 hover:text-ink transition-colors"
          >
            ← Back to verification
          </button>
        </p>
      </div>
    </div>
  )
}
