import { useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import toast from 'react-hot-toast'
import { trackAuth } from '../../lib/analytics'
import { defaultPathForRole } from '../../lib/roleRouting'
import { supabase } from '../../lib/supabase'
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

export default function Login({ role }: Props) {
  const { signIn, signInWithGoogle, user, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  // Sticky transition flag — once sign-in succeeds or the Google OAuth redirect
  // kicks off, we keep the branded loader on screen until navigation tears the
  // component down. Prevents the brief "auth form flashes back" between
  // setLoading(false) and the actual route change.
  const [transitioning, setTransitioning] = useState(false)
  const [wrongRoleError, setWrongRoleError] = useState<{ actual: 'manager' | 'tenant' } | null>(null)

  // OAuth-return seam: user is signed in (auth listener fired) but the profile
  // fetch may still be in flight. Render the branded loader rather than
  // letting the form render briefly before the Navigate.
  if (user && !profile) {
    return <LoadingSpinner message="Signing you in…" />
  }

  // Already logged in → MFA gate first, then dashboard (admin uses manager surface).
  // This path also catches OAuth returns; without the mfa check, Google would
  // bypass the second factor that the password flow enforces.
  if (!authLoading && user && profile) {
    if (profile.mfa_enabled) {
      const target = profile.mfa_method === 'totp' ? '/verify/totp' : '/verify'
      return (
        <Navigate
          to={target}
          state={{
            role: profile.role,
            method: profile.mfa_method !== 'totp' ? profile.mfa_method : undefined,
            phoneLast4: profile.phone_last_four ?? undefined,
          }}
          replace
        />
      )
    }
    return <Navigate to={defaultPathForRole(profile.role)} replace />
  }

  // Sticky transition: once a sign-in succeeded we leave the loader up until
  // the navigate() above takes effect. setLoading(false) below only fires on
  // FAILURE, so the success path can't flash the form.
  if (transitioning) {
    return <LoadingSpinner message="Signing you in…" />
  }

  const isRenter = role === 'tenant'
  const label = isRenter ? 'renter' : 'landlord'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setWrongRoleError(null)
    setLoading(true)

    // Account-lockout precheck — block before the Supabase Auth call so
    // brute-force attackers can't even attempt a password once they're locked.
    try {
      const { data: lockCheck } = await supabase.functions.invoke('auth-guard', {
        body: { action: 'check', email },
      })
      if (lockCheck?.locked) {
        toast.error('Too many failed attempts. Account locked for 15 minutes — try again later or reset your password.')
        setLoading(false)
        return
      }
    } catch {
      // Fail open — don't block users if the security service is down
    }

    try {
      const p = await signIn(email, password)
      // Admin can sign in from either login page; everyone else must match
      if (p.role !== 'admin' && p.role !== role) {
        setWrongRoleError({ actual: p.role as 'manager' | 'tenant' })
        // Report the wrong-role attempt for audit, but not as a "real" failure
        void supabase.functions.invoke('auth-guard', {
          body: { action: 'report', email, success: false, reason: 'wrong_role' },
        })
        setLoading(false)
        return
      }
      // From here on we are navigating away. Flip the sticky transitioning
      // flag so the next render shows the branded loader, and intentionally
      // skip setLoading(false) — the component will unmount when navigate()
      // takes effect, and any in-between re-render must show the loader.
      setTransitioning(true)
      trackAuth('sign_in')
      // Report success + fingerprint device + send new-device alert (async, non-blocking)
      void supabase.functions.invoke('auth-guard', {
        body: { action: 'report', email, success: true, user_id: p.id },
      })
      if (p.mfa_enabled) {
        const target = p.mfa_method === 'totp' ? '/verify/totp' : '/verify'
        navigate(target, {
          state: {
            role: p.role,
            method: p.mfa_method !== 'totp' ? p.mfa_method : undefined,
            phoneLast4: p.phone_last_four ?? undefined,
          },
        })
      } else {
        navigate(defaultPathForRole(p.role))
      }
    } catch (err) {
      // Record the failed attempt for lockout accounting
      void supabase.functions.invoke('auth-guard', {
        body: { action: 'report', email, success: false, reason: 'invalid_credentials' },
      })
      toast.error(err instanceof Error ? err.message : 'Invalid credentials')
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    // Show the loader the instant they click — the OAuth redirect can take a
    // beat to start, and we don't want them staring at the form during it.
    setTransitioning(true)
    try {
      await signInWithGoogle(role)
      // signInWithGoogle triggers a full-page redirect to Google. If we
      // reach here without a redirect (shouldn't), we still want the loader
      // visible since profile/user state is about to update.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Google sign-in failed')
      setTransitioning(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-[400px] p-8">

        {/* Logo — click returns to the marketing landing page */}
        <Link to="/" aria-label="Stoop home" className="block mb-6 hover:opacity-80 transition-opacity">
          <img src="/stoop_logo_horizontal_trans.png" alt="Stoop" className="h-20 w-auto" />
        </Link>

        {/* Heading */}
        <h1 className="text-xl font-medium text-ink">Welcome back</h1>
        <p className="text-sm text-mute mt-1 mb-6">
          Welcome to Stoop. Continue as a {label}.
        </p>

        {/* Wrong-role error */}
        {wrongRoleError && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            This account is registered as a{' '}
            <strong>{wrongRoleError.actual === 'manager' ? 'landlord' : 'renter'}</strong>.{' '}
            <Link
              to={wrongRoleError.actual === 'manager' ? '/login' : '/login/renter'}
              className="underline font-medium"
            >
              Log in as a {wrongRoleError.actual === 'manager' ? 'landlord' : 'renter'} instead.
            </Link>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-ink mb-1">
              Email address <span className="text-red-500">*</span>
            </label>
            <input
              id="login-email"
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
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="login-password" className="block text-sm font-medium text-ink">
                Password <span className="text-red-500">*</span>
              </label>
              <Link to="/forgot-password" className="text-xs text-mute hover:text-ink transition-colors">
                Forgot password?
              </Link>
            </div>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 mt-2"
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <div className="mt-4 space-y-2 text-center text-sm text-mute">
          <p>
            {isRenter
              ? <><Link to="/login" className="text-brand-600 hover:underline">Not a renter? Log in as a landlord.</Link></>
              : <><Link to="/login/renter" className="text-brand-600 hover:underline">Not a landlord? Log in as a renter.</Link></>
            }
          </p>
          <p>
            Don't have an account?{' '}
            <Link to={isRenter ? '/register/renter' : '/register'} className="text-brand-600 font-medium hover:underline">
              Sign up
            </Link>
          </p>
        </div>

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
