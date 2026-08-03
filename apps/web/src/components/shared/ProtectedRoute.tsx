import { Navigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'
import { defaultPathForRole, loginPathForRole } from '../../lib/roleRouting'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole: 'manager' | 'tenant' | 'admin'
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, profile, loading, profileError, retryProfile } = useAuth()

  if (loading) return <LoadingSpinner />

  if (!user) {
    return <Navigate to={loginPathForRole(requiredRole)} replace />
  }

  // Signed in, but the profile did not arrive.
  //
  // Every role check below reads a missing profile as the WRONG role and
  // redirects — and defaultPathForRole(undefined) lands on the manager
  // dashboard, so one flaky request on a page refresh threw a manager off
  // whatever page they were on and a tenant into the wrong portal entirely.
  //
  // Staying put and offering a retry is the honest response: we do not know
  // that this user is in the wrong place, only that we failed to find out.
  if (!profile) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-semibold text-ink">We could not load your account just now.</p>
        <p className="text-sm text-mute max-w-sm">
          {profileError ?? 'This is usually a brief connection problem.'} Your page is still here —
          try again.
        </p>
        <button
          type="button"
          onClick={() => { void retryProfile() }}
          className="mt-1 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
        >
          Try again
        </button>
      </div>
    )
  }

  // Arrived via an emailed invite/magic link and hasn't chosen a password.
  // That link is a bearer token — anyone holding a copy of the email is
  // signed in as them — so get a real credential on the account before
  // opening the portal. Enforced here rather than at the landing route so it
  // catches every entry point, including invite emails already delivered
  // with an older redirect target baked in.
  if (profile.must_set_password) {
    return <Navigate to="/set-password" replace />
  }

  // Admin-required routes — only the admin role passes.
  if (requiredRole === 'admin') {
    if (profile.role !== 'admin') {
      return <Navigate to={defaultPathForRole(profile.role)} replace />
    }
    // NOTE: admin MFA enforcement was removed pending working Twilio setup.
    // To re-enable in production:
    //   1. Verify Twilio Verify Service SID is active + phone is allowed
    //   2. Re-add: if (!profile.mfa_enabled && !window.location.pathname.startsWith('/admin/mfa-setup'))
    //       return <Navigate to="/admin/mfa-setup" replace />
    //   3. Optionally gate the redirect on import.meta.env.PROD so dev never forces MFA
    return <>{children}</>
  }

  // Admin trying to enter manager/tenant surfaces — bounce them back to
  // admin-land. Admin doesn't need the property-management or tenant UX.
  // (If we add "view as" / impersonation later, that'll be a deliberate
  // admin-side action that creates a real manager/tenant session.)
  if (profile.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />
  }

  if (profile.role !== requiredRole) {
    return <Navigate to={defaultPathForRole(profile.role)} replace />
  }

  return <>{children}</>
}
