import { Navigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole: 'manager' | 'tenant'
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth()

  if (loading) return <LoadingSpinner />

  // Not logged in → send to appropriate login page
  if (!user) {
    return <Navigate to={requiredRole === 'tenant' ? '/login/renter' : '/login'} replace />
  }

  // Admin passes every role check (super-user)
  if (profile?.role === 'admin') return <>{children}</>

  // Wrong role → redirect to their correct dashboard
  if (profile?.role !== requiredRole) {
    return <Navigate to={profile?.role === 'manager' ? '/manager/dashboard' : '/tenant/dashboard'} replace />
  }

  return <>{children}</>
}
