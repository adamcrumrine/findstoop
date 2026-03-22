import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import toast from 'react-hot-toast'

const inputClass = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent placeholder-gray-400'

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function HouseIcon() {
  return (
    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

interface Props {
  role: 'manager' | 'tenant'
}

export default function Register({ role }: Props) {
  const { signUp, signInWithGoogle, user, profile, loading: authLoading } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [success, setSuccess] = useState(false)

  // Already logged in → redirect
  if (!authLoading && user && profile) {
    return <Navigate to={profile.role === 'manager' ? '/manager/dashboard' : '/tenant/dashboard'} replace />
  }

  const isRenter = role === 'tenant'
  const label = isRenter ? 'renter' : 'landlord'

  const validate = () => {
    const errs: typeof errors = {}
    if (password.length < 6) errs.password = 'Password must be at least 6 characters'
    if (password !== confirm) errs.confirm = 'Passwords do not match'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      await signUp(email, password, role, fullName)
      setSuccess(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    try {
      await signInWithGoogle(role)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Google sign-in failed')
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-[400px] p-8 text-center">
          <div className="w-14 h-14 bg-gray-900 rounded-xl flex items-center justify-center mx-auto mb-6">
            <HouseIcon />
          </div>
          <h1 className="text-xl font-medium text-gray-900">Check your email</h1>
          <p className="text-sm text-gray-500 mt-2 mb-6">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
          <Link
            to={isRenter ? '/login/renter' : '/login'}
            className="text-sm text-brand-600 font-medium hover:underline"
          >
            Back to log in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-[400px] p-8">

        {/* Logo */}
        <div className="w-14 h-14 bg-gray-900 rounded-xl flex items-center justify-center mb-6">
          <HouseIcon />
        </div>

        {/* Heading */}
        <h1 className="text-xl font-medium text-gray-900">Create an account</h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">
          Set up your Stoop {label} account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              placeholder="Jane Smith"
            />
          </div>

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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} ${errors.password ? 'border-red-400' : ''}`}
              placeholder="••••••••"
            />
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={`${inputClass} ${errors.confirm ? 'border-red-400' : ''}`}
              placeholder="••••••••"
            />
            {errors.confirm && <p className="text-xs text-red-500 mt-1">{errors.confirm}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 mt-2"
          >
            {loading ? 'Creating account…' : 'Sign up'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to={isRenter ? '/login/renter' : '/login'} className="text-brand-600 font-medium hover:underline">
            Log in
          </Link>
        </p>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">Or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          type="button"
          className="w-full flex items-center justify-center gap-2.5 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <GoogleIcon />
          Continue with Google
        </button>
      </div>
    </div>
  )
}
