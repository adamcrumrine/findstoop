import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ProtectedRoute from './components/shared/ProtectedRoute'
import ManagerLayout from './components/layout/ManagerLayout'
import TenantLayout from './components/layout/TenantLayout'
import ManagerDashboard from './pages/manager/Dashboard'
import ManagerProperties from './pages/manager/Properties'
import ManagerUnits from './pages/manager/Units'
import ManagerTenants from './pages/manager/Tenants'
import ManagerLeases from './pages/manager/Leases'
import ManagerPayments from './pages/manager/Payments'
import ManagerMaintenance from './pages/manager/Maintenance'
import ManagerMessages from './pages/manager/Messages'
import ManagerDocuments from './pages/manager/Documents'
import ManagerReports from './pages/manager/Reports'
import TenantDashboard from './pages/tenant/Dashboard'
import TenantPayRent from './pages/tenant/PayRent'
import TenantMaintenance from './pages/tenant/Maintenance'
import TenantDocuments from './pages/tenant/Documents'
import TenantMessages from './pages/tenant/Messages'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/manager" element={
          <ProtectedRoute requiredRole="manager">
            <ManagerLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/manager/dashboard" replace />} />
          <Route path="dashboard" element={<ManagerDashboard />} />
          <Route path="properties" element={<ManagerProperties />} />
          <Route path="units" element={<ManagerUnits />} />
          <Route path="tenants" element={<ManagerTenants />} />
          <Route path="leases" element={<ManagerLeases />} />
          <Route path="payments" element={<ManagerPayments />} />
          <Route path="maintenance" element={<ManagerMaintenance />} />
          <Route path="messages" element={<ManagerMessages />} />
          <Route path="documents" element={<ManagerDocuments />} />
          <Route path="reports" element={<ManagerReports />} />
        </Route>

        <Route path="/tenant" element={
          <ProtectedRoute requiredRole="tenant">
            <TenantLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/tenant/dashboard" replace />} />
          <Route path="dashboard" element={<TenantDashboard />} />
          <Route path="pay-rent" element={<TenantPayRent />} />
          <Route path="maintenance" element={<TenantMaintenance />} />
          <Route path="documents" element={<TenantDocuments />} />
          <Route path="messages" element={<TenantMessages />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
