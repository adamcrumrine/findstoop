import { useState } from 'react'
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import type { UserRole } from '@findstoop/shared/types/profile'
import { defaultPathForRole } from '../../lib/roleRouting'

interface MfaState {
  role: UserRole
  phoneLast4?: string
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
        navigate(defaultPathForRole(state.role), { replace: true })
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
          <Link to="/" aria-label="Stoop home" className="block mb-6 hover:opacity-80 transition-opacity">
            <img src="/stoop_logo_horizontal_trans.png" alt="Stoop" className="h-20 w-auto" />
          </Link>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">Backup code used</p>
            <p>
              You have <strong>{codesRemaining}</strong> backup code{codesRemaining !== 1 ? 's' : ''} remaining.
              Generate new codes in settings.
            </p>
          </div>
          <p className="text-sm text-mute-400 text-center mt-5">Redirecting…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-[400px] p-8">

        <Link to="/" aria-label="Stoop home" className="block mb-6 hover:opacity-80 transition-opacity">
            <img src="/stoop_logo_horizontal_trans.png" alt="Stoop" className="h-20 w-auto" />
          </Link>

        <h1 className="text-xl font-medium text-ink">Enter a backup code</h1>
        <p className="text-sm text-mute mt-1 mb-6">Each backup code can only be used once.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Backup code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              autoComplete="off"
              autoFocus
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-ink placeholder-mute"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={!code.trim() || loading}
            className="w-full bg-brand-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-40"
          >
            {loading ? 'Verifying…' : 'Continue'}
          </button>
        </form>

        <p className="mt-5 text-center">
          <Link
            to="/verify/method"
            state={state}
            className="text-sm text-mute-400 hover:text-ink transition-colors"
          >
            Try another method
          </Link>
        </p>
      </div>
    </div>
  )
}
