import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import toast from 'react-hot-toast'

const inputClass = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent placeholder-gray-400'

function HouseIcon() {
  return (
    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

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

        {/* Logo */}
        <div className="w-14 h-14 bg-gray-900 rounded-xl flex items-center justify-center mb-6">
          <HouseIcon />
        </div>

        {sent ? (
          <>
            <h1 className="text-xl font-medium text-gray-900">Check your email</h1>
            <p className="text-sm text-gray-500 mt-1 mb-6">
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
            <h1 className="text-xl font-medium text-gray-900">Reset your password</h1>
            <p className="text-sm text-gray-500 mt-1 mb-6">
              Enter your email and we'll send you a link.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
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
