import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ProtectedRoute from './components/shared/ProtectedRoute'
import LoadingSpinner from './components/shared/LoadingSpinner'
import ManagerLayout from './components/layout/ManagerLayout'
import TenantLayout from './components/layout/TenantLayout'
import MarketingLayout from './components/layout/MarketingLayout'
import ApplyLayout from './components/layout/ApplyLayout'
import AdminLayout from './components/layout/AdminLayout'
import { trackPageView } from './lib/analytics'

// Public marketing
const MarketingHome        = lazy(() => import('./pages/marketing/Home'))
const MarketingFeatures    = lazy(() => import('./pages/marketing/Features'))
const MarketingPricing     = lazy(() => import('./pages/marketing/Pricing'))
const MarketingHowItWorks  = lazy(() => import('./pages/marketing/HowItWorks'))
const MarketingTenants     = lazy(() => import('./pages/marketing/Tenants'))
const MarketingTenability  = lazy(() => import('./pages/marketing/Tenability'))
const MarketingMigrate     = lazy(() => import('./pages/marketing/Migrate'))
const MarketingEducation   = lazy(() => import('./pages/marketing/Education'))
const EduScreenTenants     = lazy(() => import('./pages/marketing/education/HowToScreenTenants'))
const ManagerImport        = lazy(() => import('./pages/manager/Import'))
const EduFairHousing       = lazy(() => import('./pages/marketing/education/FairHousingGuide'))
const EduLeadPaint         = lazy(() => import('./pages/marketing/education/LeadBasedPaintDisclosure'))
const EduMoveInChecklist   = lazy(() => import('./pages/marketing/education/MoveInChecklistGuide'))
const MarketingApply       = lazy(() => import('./pages/marketing/Apply'))
const RenterCheck          = lazy(() => import('./pages/public/RenterCheck'))
const ScreeningTerms       = lazy(() => import('./pages/marketing/ScreeningTerms'))
const Privacy              = lazy(() => import('./pages/marketing/Privacy'))
const Terms                = lazy(() => import('./pages/marketing/Terms'))
const FairHousing          = lazy(() => import('./pages/marketing/FairHousing'))
const Accessibility        = lazy(() => import('./pages/marketing/Accessibility'))

// Auth
const Welcome        = lazy(() => import('./pages/auth/Welcome'))
const Login          = lazy(() => import('./pages/auth/Login'))
const Register       = lazy(() => import('./pages/auth/Register'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const Verify         = lazy(() => import('./pages/auth/Verify'))
const VerifyTotp     = lazy(() => import('./pages/auth/VerifyTotp'))
const VerifyMethod   = lazy(() => import('./pages/auth/VerifyMethod'))
const VerifyBackup   = lazy(() => import('./pages/auth/VerifyBackup'))

// Shared (manager + tenant)
const SignLease           = lazy(() => import('./pages/shared/SignLease'))
const SignDocument        = lazy(() => import('./pages/shared/SignDocument'))
const ViewDocument        = lazy(() => import('./pages/shared/ViewDocument'))
const InspectionEditor    = lazy(() => import('./pages/shared/InspectionEditor'))
const InspectionPdf       = lazy(() => import('./pages/shared/InspectionPdf'))

// Legal / compliance pages (federal disclosures, EPA pamphlet, etc.)
const FairHousingNotice   = lazy(() => import('./pages/legal/FairHousingNotice'))
const LeadPaintPamphlet   = lazy(() => import('./pages/legal/LeadPaintPamphlet'))
const LeadDisclosure      = lazy(() => import('./pages/legal/LeadDisclosure'))
const OhioTenantRights    = lazy(() => import('./pages/legal/OhioTenantRights'))

// Manager pages
const ManagerDashboard    = lazy(() => import('./pages/manager/Dashboard'))
const ManagerProperties   = lazy(() => import('./pages/manager/Properties'))
const ManagerPropertyDetail = lazy(() => import('./pages/manager/PropertyDetail'))
const ManagerUnits        = lazy(() => import('./pages/manager/Units'))
const ManagerListings     = lazy(() => import('./pages/manager/Listings'))
const ManagerApplications = lazy(() => import('./pages/manager/Applications'))
const ManagerScreening    = lazy(() => import('./pages/manager/Screening'))
const ManagerTenants      = lazy(() => import('./pages/manager/Tenants'))
const ManagerTenantDetail = lazy(() => import('./pages/manager/TenantDetail'))
const ManagerLeases       = lazy(() => import('./pages/manager/Leases'))
const ManagerAttachLeases = lazy(() => import('./pages/manager/AttachLeases'))
const ManagerReviewLease  = lazy(() => import('./pages/manager/ReviewLease'))
const ManagerLeasePdf     = lazy(() => import('./pages/manager/LeasePdf'))
const ManagerInvoicePdf   = lazy(() => import('./pages/manager/InvoicePdf'))
const ManagerTaxScheduleE = lazy(() => import('./pages/manager/TaxScheduleE'))
const ManagerRentRoll     = lazy(() => import('./pages/manager/RentRoll'))
const AdminFeedback       = lazy(() => import('./pages/admin/Feedback'))
const AdminDashboard      = lazy(() => import('./pages/admin/Dashboard'))
const AdminActivity       = lazy(() => import('./pages/admin/Activity'))
const AdminUsers          = lazy(() => import('./pages/admin/Users'))
const AdminRevenue        = lazy(() => import('./pages/admin/Revenue'))
const AdminScreening      = lazy(() => import('./pages/admin/Screening'))
const AdminSystem         = lazy(() => import('./pages/admin/System'))
const AdminSubscriptions  = lazy(() => import('./pages/admin/Subscriptions'))
const AdminFunnel         = lazy(() => import('./pages/admin/Funnel'))
const AdminMfaSetup       = lazy(() => import('./pages/admin/MfaSetup'))
const AdminVisitors       = lazy(() => import('./pages/admin/Visitors'))
const AdminRenterCheck     = lazy(() => import('./pages/admin/RenterCheck'))
const ManagerPayments     = lazy(() => import('./pages/manager/Payments'))
const ManagerMaintenance  = lazy(() => import('./pages/manager/Maintenance'))
const ManagerMessages     = lazy(() => import('./pages/manager/Messages'))
const ManagerDocuments    = lazy(() => import('./pages/manager/Documents'))
const ManagerDocumentBuilder = lazy(() => import('./pages/manager/DocumentBuilder'))
const ManagerDocumentDetail  = lazy(() => import('./pages/manager/DocumentDetail'))
const ManagerDocumentPrint   = lazy(() => import('./pages/manager/DocumentPrint'))
const ManagerEvictionPrep    = lazy(() => import('./pages/manager/EvictionPrep'))
const ManagerReports      = lazy(() => import('./pages/manager/Reports'))
const ManagerExpenses     = lazy(() => import('./pages/manager/Expenses'))
const ManagerDownloadCenter = lazy(() => import('./pages/manager/DownloadCenter'))
const ManagerBilling      = lazy(() => import('./pages/manager/Billing'))
const ManagerSettings     = lazy(() => import('./pages/manager/Settings'))

// Tenant pages
const TenantDashboard   = lazy(() => import('./pages/tenant/Dashboard'))
const TenantPayRent     = lazy(() => import('./pages/tenant/PayRent'))
const TenantMaintenance = lazy(() => import('./pages/tenant/Maintenance'))
const TenantDocuments   = lazy(() => import('./pages/tenant/Documents'))
const TenantResources   = lazy(() => import('./pages/tenant/RenterResources'))
const TenantMessages    = lazy(() => import('./pages/tenant/Messages'))
const TenantSettings    = lazy(() => import('./pages/tenant/Settings'))

// Use the same branded loader everywhere — the user never sees two different
// "loading" treatments in a single navigation.
const PageLoader = LoadingSpinner

// Fires a page-view event on every route change. Mounted inside the
// BrowserRouter so useLocation works.
function RouteTracker() {
  const { pathname } = useLocation()
  useEffect(() => {
    trackPageView(pathname)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteTracker />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public marketing */}
          <Route element={<MarketingLayout />}>
            <Route path="/"             element={<MarketingHome />} />
            <Route path="/tenants"      element={<MarketingTenants />} />
            <Route path="/education"    element={<MarketingEducation />} />
            <Route path="/education/how-to-screen-tenants"     element={<EduScreenTenants />} />
            <Route path="/education/fair-housing-act-guide"    element={<EduFairHousing />} />
            <Route path="/education/lead-based-paint-disclosure" element={<EduLeadPaint />} />
            <Route path="/education/move-in-checklist-guide"   element={<EduMoveInChecklist />} />
            <Route path="/pricing"      element={<MarketingPricing />} />
            <Route path="/features"     element={<MarketingFeatures />} />
            <Route path="/tenability"   element={<MarketingTenability />} />
            <Route path="/migrate"      element={<MarketingMigrate />} />
            <Route path="/how-it-works" element={<MarketingHowItWorks />} />
            <Route path="/screening-terms" element={<ScreeningTerms />} />
            <Route path="/privacy"      element={<Privacy />} />
            <Route path="/terms"        element={<Terms />} />
            <Route path="/fair-housing" element={<FairHousing />} />
            <Route path="/accessibility" element={<Accessibility />} />
          </Route>

          {/* Public rental application — bare layout, no marketing nav, no auth redirect */}
          <Route element={<ApplyLayout />}>
            <Route path="/apply/:unitId" element={<MarketingApply />} />
          </Route>

          {/* Auth */}
          <Route path="/welcome"         element={<Welcome />} />
          <Route path="/login"           element={<Login role="manager" />} />
          <Route path="/login/renter"    element={<Login role="tenant" />} />
          <Route path="/register"        element={<Register role="manager" />} />
          <Route path="/register/renter" element={<Register role="tenant" />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify"          element={<Verify />} />
          <Route path="/verify/totp"     element={<VerifyTotp />} />
          <Route path="/verify/method"   element={<VerifyMethod />} />
          <Route path="/verify/backup"   element={<VerifyBackup />} />

          {/* Lease PDF — standalone (no role-protected layout). The page does
              its own access check: caller must be the manager who owns the
              property, the tenant on the lease, or an admin. Keeping it out
              of /manager and /tenant means it renders without a sidebar and
              can be opened cleanly in a new tab for printing. */}
          <Route path="/lease-pdf/:id"   element={<ManagerLeasePdf />} />
          {/* Generated-document print/PDF — standalone (no sidebar); RLS scopes access. */}
          <Route path="/document-print/:id" element={<ManagerDocumentPrint />} />
          {/* Tenant-facing single-document pages — bare shell, no app nav, no upsell. */}
          <Route path="/sign-document/:id" element={<SignDocument />} />
          <Route path="/view/:id" element={<ViewDocument />} />
          {/* Renter Check — public, no-login lease explainer (its own shell). */}
          <Route path="/renter-check" element={<RenterCheck />} />
          <Route path="/manager/invoice/:id" element={<ManagerInvoicePdf />} />
          {/* Annual Schedule E tax worksheet — standalone print page (RLS scopes data). */}
          <Route path="/manager/tax/schedule-e/:year" element={<ManagerTaxScheduleE />} />
          {/* Rent roll — standalone print page; ?property=<id> scopes to one property. */}
          <Route path="/manager/rent-roll" element={<ManagerRentRoll />} />
          {/* Standalone inspection PDF — no sidebar; RLS handles access */}
          <Route path="/inspection-pdf/:id" element={<InspectionPdf />} />

          {/* Federal-disclosure pages — standalone print-ready routes.
              Accessible to any signed-in user; the page-level logic gates
              who can sign / acknowledge based on profile.role. */}
          <Route path="/legal/fair-housing-notice"     element={<FairHousingNotice />} />
          <Route path="/legal/lead-paint-pamphlet"     element={<LeadPaintPamphlet />} />
          <Route path="/legal/lead-disclosure/:leaseId" element={<LeadDisclosure />} />
          <Route path="/legal/ohio-tenant-rights"      element={<OhioTenantRights />} />
          {/* Admin MFA setup — outside AdminLayout so it renders full-screen.
              ProtectedRoute(admin) still requires the admin role to be here,
              but its MFA-required redirect explicitly exempts this path. */}
          <Route path="/admin/mfa-setup" element={
            <ProtectedRoute requiredRole="admin">
              <AdminMfaSetup />
            </ProtectedRoute>
          } />

          {/* Admin — separate layout (dark sidebar, dense). admin role required. */}
          <Route path="/admin" element={
            <ProtectedRoute requiredRole="admin">
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard"      element={<AdminDashboard />} />
            <Route path="activity"       element={<AdminActivity />} />
            <Route path="visitors"       element={<AdminVisitors />} />
            <Route path="users"          element={<AdminUsers />} />
            <Route path="subscriptions"  element={<AdminSubscriptions />} />
            <Route path="revenue"        element={<AdminRevenue />} />
            <Route path="funnel"         element={<AdminFunnel />} />
            <Route path="renter-check"   element={<AdminRenterCheck />} />
            <Route path="screening"      element={<AdminScreening />} />
            <Route path="system"         element={<AdminSystem />} />
            <Route path="feedback"       element={<AdminFeedback />} />
          </Route>

          <Route path="/manager" element={
            <ProtectedRoute requiredRole="manager">
              <ManagerLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/manager/dashboard" replace />} />
            <Route path="dashboard"    element={<ManagerDashboard />} />
            <Route path="properties"      element={<ManagerProperties />} />
            <Route path="properties/:id"  element={<ManagerPropertyDetail />} />
            <Route path="units"        element={<ManagerUnits />} />
            <Route path="listings"     element={<ManagerListings />} />
            <Route path="applications" element={<ManagerApplications />} />
            <Route path="screening"    element={<ManagerScreening />} />
            <Route path="tenants"      element={<ManagerTenants />} />
            <Route path="tenants/:id"  element={<ManagerTenantDetail />} />
            <Route path="leases"            element={<ManagerLeases />} />
            <Route path="leases/attach"     element={<ManagerAttachLeases />} />
            <Route path="review-lease/:id"  element={<ManagerReviewLease />} />
            <Route path="payments"     element={<ManagerPayments />} />
            <Route path="maintenance"  element={<ManagerMaintenance />} />
            <Route path="messages"     element={<ManagerMessages />} />
            <Route path="documents"        element={<ManagerDocuments />} />
            <Route path="documents/new"    element={<ManagerDocumentBuilder />} />
            <Route path="documents/eviction-prep/:leaseId" element={<ManagerEvictionPrep />} />
            <Route path="documents/:id"    element={<ManagerDocumentDetail />} />
            <Route path="reports"      element={<ManagerReports />} />
            <Route path="download-center" element={<ManagerDownloadCenter />} />
            <Route path="expenses"     element={<ManagerExpenses />} />
            <Route path="billing"      element={<ManagerBilling />} />
            <Route path="settings"     element={<ManagerSettings />} />
            <Route path="import"       element={<ManagerImport />} />
            <Route path="sign-lease/:id" element={<SignLease />} />
            <Route path="lease/:leaseId/inspection/:type" element={<InspectionEditor />} />
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
            <Route path="resources"   element={<TenantResources />} />
            <Route path="messages"    element={<TenantMessages />} />
            <Route path="settings"    element={<TenantSettings />} />
            <Route path="sign-lease/:id" element={<SignLease />} />
            <Route path="lease/:leaseId/inspection/:type" element={<InspectionEditor />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
