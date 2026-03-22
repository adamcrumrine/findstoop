import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import type { UserRole } from '@findstoop/shared/types/profile'
import OtpInput from '../../components/auth/OtpInput'

const LOCKOUT_KEY  = 'mfa_lockout_until'
const MAX_ATTEMPTS = 5
const LOCKOUT_MS   = 10 * 60 * 1000

interface MfaState {
  role: UserRole
  phoneLast4?: string
  factorId?: string
  challengeId?: string
}

function HouseIcon() {
  return (
    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

export default function VerifyTotp() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const state     = location.state as MfaState | null
  const { getTotpChallenge, verifyTotp } = useAuth()

  const [digits, setDigits]           = useState<string[]>(Array(6).fill(''))
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [attempts, setAttempts]       = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [totp, setTotp]               = useState<{ factorId: string; challengeId: string } | null>(
    state?.factorId && state?.challengeId
      ? { factorId: state.factorId, challengeId: state.challengeId }
      : null
  )

  // Restore lockout from localStorage
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

  // Fetch TOTP challenge on mount if not already provided
  useEffect(() => {
    if (!totp) {
      getTotpChallenge().then(setTotp).catch((e) => setError(e.message))
    }
  }, [])

  if (!state?.role) return <Navigate to="/login" replace />

  const code     = digits.join('')
  const isLocked = !!lockedUntil
  const lockMinutes = lockedUntil ? Math.ceil((lockedUntil - Date.now()) / 60000) : 0

  const handleSubmit = useCallback(async () => {
    if (code.length < 6 || loading || isLocked) return
    setLoading(true)
    setError(null)

    try {
      if (!totp) throw new Error('Challenge not ready, please wait.')
      await verifyTotp(totp.factorId, totp.challengeId, code)
      navigate(state.role === 'manager' ? '/manager/dashboard' : '/tenant/dashboard', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed'
      const next = attempts + 1
      setAttempts(next)
      setDigits(Array(6).fill(''))

      if (next >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS
        setLockedUntil(until)
        localStorage.setItem(LOCKOUT_KEY, String(until))
        setError(`Too many incorrect attempts. Try again in ${Math.ceil(LOCKOUT_MS / 60000)} minutes.`)
      } else {
        setError(`${msg} (${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next !== 1 ? 's' : ''} remaining)`)
      }
    } finally {
      setLoading(false)
    }
  }, [code, loading, isLocked, totp, attempts, state.role])

  // Auto-submit when all 6 digits filled
  useEffect(() => {
    if (code.length === 6 && !code.includes('')) handleSubmit()
  }, [code])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-[400px] p-8">

        <div className="w-14 h-14 bg-gray-900 rounded-xl flex items-center justify-center mb-6">
          <HouseIcon />
        </div>

        <h1 className="text-xl font-medium text-gray-900">Verify your identity</h1>
        <p className="text-sm text-gray-500 mt-1 mb-5">
          Welcome to Stoop. Continue as a {state.role === 'manager' ? 'landlord' : 'renter'}.
        </p>

        <div className="mb-5">
          <span className="inline-flex items-center gap-2 bg-gray-100 text-gray-600 text-sm px-3 py-1.5 rounded-full">
            <span>🔐</span>
            <span>Authenticator app</span>
          </span>
        </div>

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

            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={code.length < 6 || code.includes('') || loading}
              className="w-full mt-5 bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40"
            >
              {loading ? 'Verifying…' : 'Continue'}
            </button>
          </>
        )}

        <div className="mt-4 text-center">
          <button
            onClick={() => navigate('/verify/method', { state })}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Try another method
          </button>
        </div>

        <p className="mt-5 text-center">
          <button
            onClick={() => navigate(state.role === 'tenant' ? '/login/renter' : '/login')}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back to log in
          </button>
        </p>
      </div>
    </div>
  )
}
