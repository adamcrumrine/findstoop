import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import toast from 'react-hot-toast'

const inputClass = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink focus:border-transparent placeholder-mute'

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await sendPasswordReset(email)
      setSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reset link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-[400px] p-8">

        {/* Logo — click returns to the marketing landing page */}
        <Link to="/" aria-label="FindStoop home" className="block mb-6 hover:opacity-80 transition-opacity">
          <img src="/findstoop-logo.png" alt="FindStoop" className="h-20 w-auto" />
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
                <label className="block text-sm font-medium text-ink mb-1">
                  Email address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </div>

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
