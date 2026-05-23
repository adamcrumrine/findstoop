import { Navigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole: 'manager' | 'tenant' | 'admin'
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth()

  if (loading) return <LoadingSpinner />

  if (!user) {
    return <Navigate to={requiredRole === 'tenant' ? '/login/renter' : '/login'} replace />
  }

  // Admin-required routes — only the admin role passes.
  if (requiredRole === 'admin') {
    if (profile?.role !== 'admin') {
      return <Navigate to={profile?.role === 'tenant' ? '/tenant/dashboard' : '/manager/dashboard'} replace />
    }
    return <>{children}</>
  }

  // Manager/tenant routes — admin always allowed, otherwise role must match.
  if (profile?.role === 'admin') return <>{children}</>

  if (profile?.role !== requiredRole) {
    return <Navigate to={profile?.role === 'manager' ? '/manager/dashboard' : '/tenant/dashboard'} replace />
  }

  return <>{children}</>
}
