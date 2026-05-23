import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/shared/ProtectedRoute'
import ManagerLayout from './components/layout/ManagerLayout'
import TenantLayout from './components/layout/TenantLayout'
import MarketingLayout from './components/layout/MarketingLayout'

// Public marketing
const MarketingHome        = lazy(() => import('./pages/marketing/Home'))
const MarketingFeatures    = lazy(() => import('./pages/marketing/Features'))
const MarketingPricing     = lazy(() => import('./pages/marketing/Pricing'))
const MarketingHowItWorks  = lazy(() => import('./pages/marketing/HowItWorks'))
const MarketingTenants     = lazy(() => import('./pages/marketing/Tenants'))
const MarketingEducation   = lazy(() => import('./pages/marketing/Education'))
const MarketingApply       = lazy(() => import('./pages/marketing/Apply'))

// Auth
const Login          = lazy(() => import('./pages/auth/Login'))
const Register       = lazy(() => import('./pages/auth/Register'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const Verify         = lazy(() => import('./pages/auth/Verify'))
const VerifyTotp     = lazy(() => import('./pages/auth/VerifyTotp'))
const VerifyMethod   = lazy(() => import('./pages/auth/VerifyMethod'))
const VerifyBackup   = lazy(() => import('./pages/auth/VerifyBackup'))

// Shared (manager + tenant)
const SignLease           = lazy(() => import('./pages/shared/SignLease'))

// Manager pages
const ManagerDashboard    = lazy(() => import('./pages/manager/Dashboard'))
const ManagerProperties   = lazy(() => import('./pages/manager/Properties'))
const ManagerUnits        = lazy(() => import('./pages/manager/Units'))
const ManagerListings     = lazy(() => import('./pages/manager/Listings'))
const ManagerApplications = lazy(() => import('./pages/manager/Applications'))
const ManagerScreening    = lazy(() => import('./pages/manager/Screening'))
const ManagerTenants      = lazy(() => import('./pages/manager/Tenants'))
const ManagerLeases       = lazy(() => import('./pages/manager/Leases'))
const ManagerPayments     = lazy(() => import('./pages/manager/Payments'))
const ManagerMaintenance  = lazy(() => import('./pages/manager/Maintenance'))
const ManagerMessages     = lazy(() => import('./pages/manager/Messages'))
const ManagerDocuments    = lazy(() => import('./pages/manager/Documents'))
const ManagerReports      = lazy(() => import('./pages/manager/Reports'))
const ManagerBilling      = lazy(() => import('./pages/manager/Billing'))
const ManagerSettings     = lazy(() => import('./pages/manager/Settings'))

// Tenant pages
const TenantDashboard   = lazy(() => import('./pages/tenant/Dashboard'))
const TenantPayRent     = lazy(() => import('./pages/tenant/PayRent'))
const TenantMaintenance = lazy(() => import('./pages/tenant/Maintenance'))
const TenantDocuments   = lazy(() => import('./pages/tenant/Documents'))
const TenantMessages    = lazy(() => import('./pages/tenant/Messages'))
const TenantSettings    = lazy(() => import('./pages/tenant/Settings'))

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
          {/* Public marketing */}
          <Route element={<MarketingLayout />}>
            <Route path="/"             element={<MarketingHome />} />
            <Route path="/tenants"      element={<MarketingTenants />} />
            <Route path="/education"    element={<MarketingEducation />} />
            <Route path="/pricing"      element={<MarketingPricing />} />
            <Route path="/features"     element={<MarketingFeatures />} />
            <Route path="/how-it-works" element={<MarketingHowItWorks />} />
            <Route path="/apply/:unitId" element={<MarketingApply />} />
          </Route>

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
            <Route path="dashboard"    element={<ManagerDashboard />} />
            <Route path="properties"   element={<ManagerProperties />} />
            <Route path="units"        element={<ManagerUnits />} />
            <Route path="listings"     element={<ManagerListings />} />
            <Route path="applications" element={<ManagerApplications />} />
            <Route path="screening"    element={<ManagerScreening />} />
            <Route path="tenants"      element={<ManagerTenants />} />
            <Route path="leases"       element={<ManagerLeases />} />
            <Route path="payments"     element={<ManagerPayments />} />
            <Route path="maintenance"  element={<ManagerMaintenance />} />
            <Route path="messages"     element={<ManagerMessages />} />
            <Route path="documents"    element={<ManagerDocuments />} />
            <Route path="reports"      element={<ManagerReports />} />
            <Route path="billing"      element={<ManagerBilling />} />
            <Route path="settings"     element={<ManagerSettings />} />
            <Route path="sign-lease/:id" element={<SignLease />} />
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
            <Route path="settings"    element={<TenantSettings />} />
            <Route path="sign-lease/:id" element={<SignLease />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
