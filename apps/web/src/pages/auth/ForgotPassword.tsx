import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import toast from 'react-hot-toast'
import { BRAND } from '../../lib/brand'
import HumanCheck, { HUMAN_CHECK_ENABLED, type HumanCheckHandle } from '../../components/shared/HumanCheck'

const inputClass = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink focus:border-transparent placeholder-mute'

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [humanToken, setHumanToken] = useState<string | null>(null)
  const humanRef = useRef<HumanCheckHandle>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (HUMAN_CHECK_ENABLED && !humanToken) {
      toast.error('Please complete the “I’m human” check.')
      return
    }
    setLoading(true)
    try {
      await sendPasswordReset(email, humanToken ?? undefined)
      setSent(true)
    } catch (err) {
      humanRef.current?.reset()
      toast.error(err instanceof Error ? err.message : 'Failed to send reset link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-[400px] p-8">

        {/* Logo — click returns to the marketing landing page */}
        <Link to="/" aria-label={`${BRAND.name} home`} className="block mb-6 hover:opacity-80 transition-opacity">
          <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-14 w-auto" />
        </Link>

        {sent ? (
          <>
            <h1 className="text-xl font-medium text-ink">Check your email</h1>
            <p className="text-sm text-mute mt-1 mb-6">
              We sent a password reset link to <strong>{email}</strong>. Check your inbox and follow the link to reset your password.
            </p>
            <Link
              to="/login"
              className="text-sm text-brand-600 font-medium hover:underline"
            >
              ← Back to log in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-medium text-ink">Reset your password</h1>
            <p className="text-sm text-mute mt-1 mb-6">
              Enter your email and we'll send you a link.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="block text-sm font-medium text-ink mb-1">
                  Email address <span className="text-red-500">*</span>
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </div>

              <HumanCheck ref={humanRef} onToken={setHumanToken} />

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <p className="mt-4 text-center">
              <Link to="/login" className="text-sm text-brand-600 font-medium hover:underline">
                ← Back to log in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
