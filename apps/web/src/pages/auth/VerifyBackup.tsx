import { useState } from 'react'
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import type { UserRole } from '@findstoop/shared/types/profile'

interface MfaState {
  role: UserRole
  phoneLast4?: string
}

function HouseIcon() {
  return (
    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

export default function VerifyBackup() {
  const navigate = useNavigate()
  const location = useLocation()
  const state    = location.state as MfaState | null
  const { verifyBackupCode } = useAuth()

  const [code, setCode]                       = useState('')
  const [loading, setLoading]                 = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const [codesRemaining, setCodesRemaining]   = useState<number | null>(null)

  if (!state?.role) return <Navigate to="/login" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const { remaining } = await verifyBackupCode(code.trim())
      setCodesRemaining(remaining)
      setTimeout(() => {
        navigate(state.role === 'manager' ? '/manager/dashboard' : '/tenant/dashboard', { replace: true })
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid backup code')
    } finally {
      setLoading(false)
    }
  }

  if (codesRemaining !== null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-[400px] p-8">
          <div className="w-14 h-14 bg-gray-900 rounded-xl flex items-center justify-center mb-6">
            <HouseIcon />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">Backup code used</p>
            <p>
              You have <strong>{codesRemaining}</strong> backup code{codesRemaining !== 1 ? 's' : ''} remaining.
              Generate new codes in settings.
            </p>
          </div>
          <p className="text-sm text-gray-400 text-center mt-5">Redirecting…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-[400px] p-8">

        <div className="w-14 h-14 bg-gray-900 rounded-xl flex items-center justify-center mb-6">
          <HouseIcon />
        </div>

        <h1 className="text-xl font-medium text-gray-900">Enter a backup code</h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">Each backup code can only be used once.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Backup code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              autoComplete="off"
              autoFocus
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-gray-900 placeholder-gray-400"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={!code.trim() || loading}
            className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40"
          >
            {loading ? 'Verifying…' : 'Continue'}
          </button>
        </form>

        <p className="mt-5 text-center">
          <Link
            to="/verify/method"
            state={state}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Try another method
          </Link>
        </p>
      </div>
    </div>
  )
}
