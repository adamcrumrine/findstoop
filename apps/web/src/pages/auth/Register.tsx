import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import toast from 'react-hot-toast'
import { useGeoState } from '../../lib/useGeoState'
import { isBlockedState, blockedStateName, BLOCKED_STATES_DISPLAY } from '../../lib/blockedStates'
import { trackAuth } from '../../lib/analytics'
import { defaultPathForRole } from '../../lib/roleRouting'
import { checkPasswordStrength, hibpCheckPassword } from '../../lib/passwordSecurity'
import LoadingSpinner from '../../components/shared/LoadingSpinner'

const inputClass = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink focus:border-transparent placeholder-mute'

// Official multi-color Google G — required by Google's sign-in branding guidelines.
function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

interface Props {
  role: 'manager' | 'tenant'
}

export default function Register({ role }: Props) {
  const { signUp, signInWithGoogle, user, profile, loading: authLoading } = useAuth()
  const [searchParams] = useSearchParams()
  const prefilledEmail = searchParams.get('email') ?? ''
  const geo = useGeoState()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(prefilledEmail)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [success, setSuccess] = useState(false)

  // OAuth-return seam: user is signed in but profile hasn't loaded yet.
  // Render the branded loader instead of letting the form flash through.
  if (user && !profile) {
    return <LoadingSpinner message="Setting up your account…" />
  }

  // Already logged in → redirect
  if (!authLoading && user && profile) {
    return <Navigate to={defaultPathForRole(profile.role)} replace />
  }

  // Sticky transition for Google OAuth — the click triggers a redirect
  // that can take a beat; we don't want them staring at the form.
  if (transitioning) {
    return <LoadingSpinner message="Signing you in…" />
  }

  // Best-effort geo block — show a friendly "not yet available" page if the
  // visitor's IP-detected state is currently paused. VPNs can bypass; the
  // server-side property-creation block is the real safety net.
  if (geo.detected && geo.country === 'US' && isBlockedState(geo.state)) {
    return <GeoBlockedPage state={geo.state ?? ''} />
  }

  const isRenter = role === 'tenant'
  const label = isRenter ? 'renter' : 'landlord'

  const validate = (): { ok: boolean; passwordError?: string } => {
    const errs: typeof errors = {}
    const strength = checkPasswordStrength(password, email)
    if (!strength.ok) errs.password = strength.reason
    if (password !== confirm) errs.confirm = 'Passwords do not match'
    setErrors(errs)
    return { ok: Object.keys(errs).length === 0, passwordError: errs.password }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = validate()
    if (!v.ok) return
    setLoading(true)
    try {
      // HIBP check — block passwords known to be in leaked-credential dumps.
      // Fails open if HIBP is unreachable.
      const seenCount = await hibpCheckPassword(password)
      if (seenCount > 0) {
        setErrors({ password: `This password has appeared in ${seenCount.toLocaleString()} data breaches. Choose a different one.` })
        setLoading(false)
        return
      }
      await signUp(email, password, role, fullName)
      trackAuth('sign_up')
      setSuccess(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setTransitioning(true)
    try {
      await signInWithGoogle(role)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Google sign-in failed')
      setTransitioning(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-[400px] p-8 text-center">
          <Link to="/" aria-label="Stoop home" className="block mx-auto w-fit mb-6 hover:opacity-80 transition-opacity">
            <img src="/stoop_logo_horizontal_trans.png" alt="Stoop" className="h-20 w-auto" />
          </Link>
          <h1 className="text-xl font-medium text-ink">Check your email</h1>
          <p className="text-sm text-mute mt-2 mb-6">
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

        {/* Logo — click returns to the marketing landing page */}
        <Link to="/" aria-label="Stoop home" className="block mb-6 hover:opacity-80 transition-opacity">
          <img src="/stoop_logo_horizontal_trans.png" alt="Stoop" className="h-20 w-auto" />
        </Link>

        {/* Heading */}
        <h1 className="text-xl font-medium text-ink">Create an account</h1>
        <p className="text-sm text-mute mt-1 mb-6">
          Set up your Stoop {label} account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="register-name" className="block text-sm font-medium text-ink mb-1">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              placeholder="Jane Smith"
            />
          </div>

          <div>
            <label htmlFor="register-email" className="block text-sm font-medium text-ink mb-1">
              Email address <span className="text-red-500">*</span>
            </label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="register-password" className="block text-sm font-medium text-ink mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'register-password-error' : undefined}
              className={`${inputClass} ${errors.password ? 'border-red-400' : ''}`}
              placeholder="••••••••"
            />
            {errors.password && <p id="register-password-error" className="text-xs text-red-500 mt-1">{errors.password}</p>}
          </div>

          <div>
            <label htmlFor="register-confirm" className="block text-sm font-medium text-ink mb-1">
              Confirm password <span className="text-red-500">*</span>
            </label>
            <input
              id="register-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={!!errors.confirm}
              aria-describedby={errors.confirm ? 'register-confirm-error' : undefined}
              className={`${inputClass} ${errors.confirm ? 'border-red-400' : ''}`}
              placeholder="••••••••"
            />
            {errors.confirm && <p id="register-confirm-error" className="text-xs text-red-500 mt-1">{errors.confirm}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 mt-2"
          >
            {loading ? 'Creating account…' : 'Sign up'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-mute">
          Already have an account?{' '}
          <Link to={isRenter ? '/login/renter' : '/login'} className="text-brand-600 font-medium hover:underline">
            Log in
          </Link>
        </p>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-mute font-medium">Or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          type="button"
          className="w-full flex items-center justify-center gap-2.5 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-ink hover:bg-gray-50 transition-colors"
        >
          <GoogleIcon />
          Continue with Google
        </button>
      </div>
    </div>
  )
}

// Shown when the visitor's IP geolocates to a currently-paused state.
// They can still browse marketing pages — just not sign up.
function GeoBlockedPage({ state }: { state: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-[480px] p-8">
        <Link to="/" aria-label="Stoop home" className="block mx-auto w-fit mb-6 hover:opacity-80 transition-opacity">
          <img src="/stoop_logo_horizontal_trans.png" alt="Stoop" className="h-16 w-auto" />
        </Link>
        <h1 className="text-xl font-semibold text-ink text-center">Stoop isn't open in {blockedStateName(state)} yet</h1>
        <p className="text-sm text-mute mt-3 leading-relaxed text-center">
          We're rolling out state by state and completing the compliance work each one requires.
          Right now we're paused for new signups in {BLOCKED_STATES_DISPLAY}. Everything else on
          Stoop — pricing, features, education — stays open to you while we get there.
        </p>
        <p className="text-xs text-mute mt-5 text-center">
          Think this is a mistake? (VPN, work network, etc.) Email{' '}
          <a href="mailto:support@findstoop.com" className="text-brand-600 hover:underline">support@findstoop.com</a>{' '}
          and we'll sort it out.
        </p>
        <div className="mt-6 flex justify-center">
          <Link to="/" className="text-sm font-medium text-brand-600 hover:underline">← Back to Stoop</Link>
        </div>
      </div>
    </div>
  )
}
