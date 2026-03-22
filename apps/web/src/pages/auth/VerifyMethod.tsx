import { useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import type { UserRole } from '@findstoop/shared/types/profile'
import toast from 'react-hot-toast'

interface MfaState {
  role: UserRole
  phoneLast4?: string
  factorId?: string
  challengeId?: string
}

type MethodId = 'sms' | 'call' | 'totp' | 'backup'

interface Method {
  id: MethodId
  icon: string
  title: string
  subtitle: string
}

function HouseIcon() {
  return (
    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
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
            icon: '📱',
            title: 'Text message (SMS)',
            subtitle: `Send a code to ••••••••${state.phoneLast4}`,
          },
          {
            id: 'call' as MethodId,
            icon: '📞',
            title: 'Phone call',
            subtitle: `Call ••••••••${state.phoneLast4} with a code`,
          },
        ]
      : []),
    {
      id: 'totp',
      icon: '🔐',
      title: 'Authenticator app',
      subtitle: 'Use Google Authenticator or similar',
    },
    {
      id: 'backup',
      icon: '🔑',
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

        <div className="w-14 h-14 bg-gray-900 rounded-xl flex items-center justify-center mb-6">
          <HouseIcon />
        </div>

        <h1 className="text-xl font-medium text-gray-900">Try another method</h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">
          Choose how you'd like to verify your identity.
        </p>

        <div className="space-y-2">
          {methods.map((m) => (
            <button
              key={m.id}
              onClick={() => handleSelect(m.id)}
              disabled={!!busy}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all disabled:opacity-60 ${
                busy === m.id
                  ? 'border-sky-400 bg-sky-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-lg text-xl flex-shrink-0">
                {busy === m.id ? (
                  <span className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin inline-block" />
                ) : (
                  m.icon
                )}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900">{m.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{m.subtitle}</p>
              </div>
            </button>
          ))}
        </div>

        <p className="mt-6 text-center">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back to verification
          </button>
        </p>
      </div>
    </div>
  )
}
