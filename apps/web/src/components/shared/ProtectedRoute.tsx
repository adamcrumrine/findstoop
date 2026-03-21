import { Navigate } from 'react-router-dom'
import { useAuth } from '../../../../packages/shared/src/hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole: 'manager' | 'tenant'
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth()

  if (loading) return <LoadingSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (profile?.role !== requiredRole) {
    return <Navigate to={profile?.role === 'manager' ? '/manager/dashboard' : '/tenant/dashboard'} replace />
  }

  return <>{children}</>
}
