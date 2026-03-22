import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import type { MfaMethod, UserRole } from '@findstoop/shared/types/profile'
import toast from 'react-hot-toast'

const LOCKOUT_KEY   = 'mfa_lockout_until'
const MAX_ATTEMPTS  = 5
const LOCKOUT_MS    = 10 * 60 * 1000   // 10 minutes
const RESEND_WAIT   = 30               // seconds

function HouseIcon() {
  return (
    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

// ── 6-box OTP input ───────────────────────────────────────────────────────────

interface OtpInputProps {
  value: string[]
  onChange: (digits: string[]) => void
  disabled?: boolean
}

function OtpInput({ value, onChange, disabled }: OtpInputProps) {
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null))

  const focus = (i: number) => refs[i]?.current?.focus()

  const handleChange = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    const next = [...value]
    next[i] = digit
    onChange(next)
    if (digit && i < 5) focus(i + 1)
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (value[i]) {
        const next = [...value]
        next[i] = ''
        onChange(next)
      } else if (i > 0) {
        focus(i - 1)
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      focus(i - 1)
    } else if (e.key === 'ArrowRight' && i < 5) {
      focus(i + 1)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = [...value]
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? ''
    onChange(next)
    focus(Math.min(pasted.length, 5))
  }

  return (
    <div className="flex gap-2 justify-between">
      {value.map((digit, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={`w-12 h-14 text-center text-xl font-semibold border rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 transition-colors disabled:opacity-40 ${
            digit ? 'border-gray-900 bg-gray-50' : 'border-gray-300'
          }`}
        />
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface LocationState {
  role: UserRole
  method: MfaMethod
  phoneLast4?: string
  factorId?: string
  challengeId?: string
}

export default function Verify() {
  const navigate   = useNavigate()
  const location   = useLocation()
  const state      = location.state as LocationState | null
  const { getTotpChallenge, verifyTotp, sendSmsCode, verifySmsCode } = useAuth()

  const [digits, setDigits]         = useState<string[]>(Array(6).fill(''))
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [attempts, setAttempts]     = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [showMethods, setShowMethods] = useState(false)
  const [activeMethod, setActiveMethod] = useState<MfaMethod>(state?.method ?? 'totp')
  const [totp, setTotp] = useState<{ factorId: string; challengeId: string } | null>(
    state?.factorId && state?.challengeId
      ? { factorId: state.factorId, challengeId: state.challengeId }
      : null
  )

  // Check for existing lockout on mount
  useEffect(() => {
    const stored = localStorage.getItem(LOCKOUT_KEY)
    if (stored) {
      const until = parseInt(stored, 10)
      if (Date.now() < until) setLockedUntil(until)
      else localStorage.removeItem(LOCKOUT_KEY)
    }
  }, [])

  // Lockout countdown
  useEffect(() => {
    if (!lockedUntil) return
    const id = setInterval(() => {
      if (Date.now() >= lockedUntil) {
        setLockedUntil(null)
        setAttempts(0)
        localStorage.removeItem(LOCKOUT_KEY)
        clearInterval(id)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [resendCooldown])

  // On mount for SMS: auto-send code
  useEffect(() => {
    if (activeMethod === 'sms') {
      sendSmsCode('sms').catch(() => {})
      setResendCooldown(RESEND_WAIT)
    }
    if (activeMethod === 'totp' && !totp) {
      getTotpChallenge().then(setTotp).catch((e) => setError(e.message))
    }
  }, [activeMethod])

  // Guard: must come from login with state
  if (!state?.role) return <Navigate to="/login" replace />

  const code = digits.join('')
  const isLocked = !!lockedUntil
  const lockMinutes = lockedUntil ? Math.ceil((lockedUntil - Date.now()) / 60000) : 0

  const handleSubmit = useCallback(async () => {
    if (code.length < 6 || loading || isLocked) return
    setLoading(true)
    setError(null)

    try {
      if (activeMethod === 'totp') {
        if (!totp) throw new Error('Challenge not ready, please wait.')
        await verifyTotp(totp.factorId, totp.challengeId, code)
      } else {
        await verifySmsCode(code)
      }
      navigate(state.role === 'manager' ? '/manager/dashboard' : '/tenant/dashboard', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed'
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      setDigits(Array(6).fill(''))

      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS
        setLockedUntil(until)
        localStorage.setItem(LOCKOUT_KEY, String(until))
        setError(`Too many incorrect attempts. Try again in ${Math.ceil(LOCKOUT_MS / 60000)} minutes.`)
      } else {
        setError(`${msg} (${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? 's' : ''} remaining)`)
      }
    } finally {
      setLoading(false)
    }
  }, [code, loading, isLocked, activeMethod, totp, attempts, state.role])

  // Auto-submit when all 6 digits filled
  useEffect(() => {
    if (code.length === 6 && !code.includes('')) handleSubmit()
  }, [code])

  const handleResend = async (channel: 'sms' | 'call') => {
    if (resendCooldown > 0) return
    try {
      await sendSmsCode(channel)
      setResendCooldown(RESEND_WAIT)
      toast.success(channel === 'sms' ? 'Code sent via SMS' : 'Call placed to your phone')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send code')
    }
  }

  const switchMethod = async (method: MfaMethod) => {
    setActiveMethod(method)
    setDigits(Array(6).fill(''))
    setError(null)
    setShowMethods(false)
    if (method === 'totp') {
      setTotp(null) // will re-fetch in useEffect
    }
  }

  const label = state.role === 'manager' ? 'landlord' : 'renter'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-[400px] p-8">

        {/* Logo */}
        <div className="w-14 h-14 bg-gray-900 rounded-xl flex items-center justify-center mb-6">
          <HouseIcon />
        </div>

        <h1 className="text-xl font-medium text-gray-900">Verify your identity</h1>
        <p className="text-sm text-gray-500 mt-1 mb-5">
          Welcome to Stoop. Continue as a {label}.
        </p>

        {/* Masked phone / method indicator */}
        {(activeMethod === 'sms' || activeMethod === 'totp') && (
          <div className="mb-5">
            {activeMethod === 'sms' && state.phoneLast4 ? (
              <span className="inline-flex items-center gap-2 bg-gray-100 text-gray-600 text-sm px-3 py-1.5 rounded-full">
                <span>📱</span>
                <span>••••••••{state.phoneLast4}</span>
              </span>
            ) : activeMethod === 'totp' ? (
              <span className="inline-flex items-center gap-2 bg-gray-100 text-gray-600 text-sm px-3 py-1.5 rounded-full">
                <span>🔐</span>
                <span>Authenticator app</span>
              </span>
            ) : null}
          </div>
        )}

        {/* Lockout state */}
        {isLocked ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 text-center mb-4">
            Too many incorrect attempts.<br />
            Try again in <strong>{lockMinutes} minute{lockMinutes !== 1 ? 's' : ''}</strong>.
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Enter the 6-digit code <span className="text-red-500">*</span>
            </label>

            <OtpInput value={digits} onChange={setDigits} disabled={loading} />

            {error && (
              <p className="text-sm text-red-500 mt-3">{error}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={code.length < 6 || code.includes('') || loading}
              className="w-full mt-5 bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40"
            >
              {loading ? 'Verifying…' : 'Continue'}
            </button>
          </>
        )}

        {/* Resend / get a call (SMS only) */}
        {activeMethod === 'sms' && !isLocked && (
          <p className="mt-4 text-sm text-center text-gray-500">
            Didn't receive a code?{' '}
            {resendCooldown > 0 ? (
              <span className="text-gray-400">Resend in {resendCooldown}s</span>
            ) : (
              <>
                <button onClick={() => handleResend('sms')} className="text-brand-600 hover:underline font-medium">
                  Resend
                </button>
                {' or '}
                <button onClick={() => handleResend('call')} className="text-brand-600 hover:underline font-medium">
                  get a call
                </button>
              </>
            )}
          </p>
        )}

        {/* Try another method */}
        <div className="mt-4 text-center">
          <button
            onClick={() => setShowMethods((v) => !v)}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Try another method
          </button>

          {showMethods && (
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1 text-left">
              {activeMethod !== 'sms' && (
                <button
                  onClick={() => switchMethod('sms')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-white hover:shadow-sm transition-all"
                >
                  <span className="text-lg">📱</span>
                  <div>
                    <p className="font-medium">SMS code</p>
                    <p className="text-xs text-gray-400">Send a code to your phone</p>
                  </div>
                </button>
              )}
              {activeMethod !== 'totp' && (
                <button
                  onClick={() => switchMethod('totp')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-white hover:shadow-sm transition-all"
                >
                  <span className="text-lg">🔐</span>
                  <div>
                    <p className="font-medium">Authenticator app</p>
                    <p className="text-xs text-gray-400">Use Google Authenticator or Authy</p>
                  </div>
                </button>
              )}
              <button
                onClick={() => {
                  setShowMethods(false)
                  toast('Contact your administrator to recover access.', { icon: 'ℹ️' })
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-white hover:shadow-sm transition-all"
              >
                <span className="text-lg">🔑</span>
                <div>
                  <p className="font-medium">Backup code</p>
                  <p className="text-xs text-gray-400">Use an emergency backup code</p>
                </div>
              </button>
            </div>
          )}
        </div>

        <p className="mt-5 text-center">
          <Link
            to={state.role === 'tenant' ? '/login/renter' : '/login'}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back to log in
          </Link>
        </p>
      </div>
    </div>
  )
}
