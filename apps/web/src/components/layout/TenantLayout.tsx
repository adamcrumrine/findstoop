import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'

const navItems = [
  { to: '/tenant/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/tenant/pay-rent', label: 'Pay Rent', icon: '💳' },
  { to: '/tenant/maintenance', label: 'Maintenance', icon: '🔧' },
  { to: '/tenant/documents', label: 'Documents', icon: '📁' },
  { to: '/tenant/messages', label: 'Messages', icon: '💬' },
]

export default function TenantLayout() {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-lg font-bold text-brand-600">FindStoop</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name ?? profile?.email}</span>
          <button onClick={handleSignOut} className="text-sm text-gray-500 hover:text-red-600 transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 py-2 text-xs transition-colors ${
                isActive ? 'text-brand-600' : 'text-gray-500'
              }`
            }
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
