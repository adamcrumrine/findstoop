import { Navigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'
import { defaultPathForRole, loginPathForRole } from '../../lib/roleRouting'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole: 'manager' | 'tenant' | 'admin'
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth()

  if (loading) return <LoadingSpinner />

  if (!user) {
    return <Navigate to={loginPathForRole(requiredRole)} replace />
  }

  // Arrived via an emailed invite/magic link and hasn't chosen a password.
  // That link is a bearer token — anyone holding a copy of the email is
  // signed in as them — so get a real credential on the account before
  // opening the portal. Enforced here rather than at the landing route so it
  // catches every entry point, including invite emails already delivered
  // with an older redirect target baked in.
  if (profile?.must_set_password) {
    return <Navigate to="/set-password" replace />
  }

  // Admin-required routes — only the admin role passes.
  if (requiredRole === 'admin') {
    if (profile?.role !== 'admin') {
      return <Navigate to={defaultPathForRole(profile?.role)} replace />
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
  if (profile?.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />
  }

  if (profile?.role !== requiredRole) {
    return <Navigate to={defaultPathForRole(profile?.role)} replace />
  }

  return <>{children}</>
}
