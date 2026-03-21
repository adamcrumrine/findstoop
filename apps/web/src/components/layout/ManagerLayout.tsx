import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'

const navItems = [
  { to: '/manager/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/manager/properties', label: 'Properties', icon: '🏢' },
  { to: '/manager/units', label: 'Units', icon: '🚪' },
  { to: '/manager/tenants', label: 'Tenants', icon: '👥' },
  { to: '/manager/leases', label: 'Leases', icon: '📄' },
  { to: '/manager/payments', label: 'Payments', icon: '💳' },
  { to: '/manager/maintenance', label: 'Maintenance', icon: '🔧' },
  { to: '/manager/messages', label: 'Messages', icon: '💬' },
  { to: '/manager/documents', label: 'Documents', icon: '📁' },
  { to: '/manager/reports', label: 'Reports', icon: '📊' },
]

export default function ManagerLayout() {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-brand-600">FindStoop</h1>
          <p className="text-xs text-gray-500 mt-1">{profile?.full_name ?? profile?.email}</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium mb-1 transition-colors ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleSignOut}
            className="w-full text-sm text-gray-500 hover:text-red-600 text-left transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-brand-600">FindStoop</h1>
          <button onClick={handleSignOut} className="text-sm text-gray-500">Sign out</button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>

        {/* Bottom nav — mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex overflow-x-auto">
          {navItems.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 py-2 text-xs min-w-[60px] transition-colors ${
                  isActive ? 'text-brand-600' : 'text-gray-500'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
