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

  if (!user) {
    return <Navigate to={requiredRole === 'tenant' ? '/login/renter' : '/login'} replace />
  }

  if (profile?.role === 'admin') return <>{children}</>

  if (profile?.role !== requiredRole) {
    return <Navigate to={profile?.role === 'manager' ? '/manager/dashboard' : '/tenant/dashboard'} replace />
  }

  return <>{children}</>
}
