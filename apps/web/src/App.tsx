import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/shared/ProtectedRoute'
import ManagerLayout from './components/layout/ManagerLayout'
import TenantLayout from './components/layout/TenantLayout'

// Auth
const Login          = lazy(() => import('./pages/auth/Login'))
const Register       = lazy(() => import('./pages/auth/Register'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const Verify         = lazy(() => import('./pages/auth/Verify'))
const VerifyTotp     = lazy(() => import('./pages/auth/VerifyTotp'))
const VerifyMethod   = lazy(() => import('./pages/auth/VerifyMethod'))
const VerifyBackup   = lazy(() => import('./pages/auth/VerifyBackup'))

// Manager pages
const ManagerDashboard   = lazy(() => import('./pages/manager/Dashboard'))
const ManagerProperties  = lazy(() => import('./pages/manager/Properties'))
const ManagerUnits       = lazy(() => import('./pages/manager/Units'))
const ManagerTenants     = lazy(() => import('./pages/manager/Tenants'))
const ManagerLeases      = lazy(() => import('./pages/manager/Leases'))
const ManagerPayments    = lazy(() => import('./pages/manager/Payments'))
const ManagerMaintenance = lazy(() => import('./pages/manager/Maintenance'))
const ManagerMessages    = lazy(() => import('./pages/manager/Messages'))
const ManagerDocuments   = lazy(() => import('./pages/manager/Documents'))
const ManagerReports     = lazy(() => import('./pages/manager/Reports'))

// Tenant pages
const TenantDashboard   = lazy(() => import('./pages/tenant/Dashboard'))
const TenantPayRent     = lazy(() => import('./pages/tenant/PayRent'))
const TenantMaintenance = lazy(() => import('./pages/tenant/Maintenance'))
const TenantDocuments   = lazy(() => import('./pages/tenant/Documents'))
const TenantMessages    = lazy(() => import('./pages/tenant/Messages'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Auth */}
          <Route path="/login"           element={<Login role="manager" />} />
          <Route path="/login/renter"    element={<Login role="tenant" />} />
          <Route path="/register"        element={<Register role="manager" />} />
          <Route path="/register/renter" element={<Register role="tenant" />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify"          element={<Verify />} />
          <Route path="/verify/totp"     element={<VerifyTotp />} />
          <Route path="/verify/method"   element={<VerifyMethod />} />
          <Route path="/verify/backup"   element={<VerifyBackup />} />

          <Route path="/manager" element={
            <ProtectedRoute requiredRole="manager">
              <ManagerLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/manager/dashboard" replace />} />
            <Route path="dashboard"   element={<ManagerDashboard />} />
            <Route path="properties"  element={<ManagerProperties />} />
            <Route path="units"       element={<ManagerUnits />} />
            <Route path="tenants"     element={<ManagerTenants />} />
            <Route path="leases"      element={<ManagerLeases />} />
            <Route path="payments"    element={<ManagerPayments />} />
            <Route path="maintenance" element={<ManagerMaintenance />} />
            <Route path="messages"    element={<ManagerMessages />} />
            <Route path="documents"   element={<ManagerDocuments />} />
            <Route path="reports"     element={<ManagerReports />} />
          </Route>

          <Route path="/tenant" element={
            <ProtectedRoute requiredRole="tenant">
              <TenantLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/tenant/dashboard" replace />} />
            <Route path="dashboard"   element={<TenantDashboard />} />
            <Route path="pay-rent"    element={<TenantPayRent />} />
            <Route path="maintenance" element={<TenantMaintenance />} />
            <Route path="documents"   element={<TenantDocuments />} />
            <Route path="messages"    element={<TenantMessages />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
