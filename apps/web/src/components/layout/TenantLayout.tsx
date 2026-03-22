import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'

const navItems = [
  { to: '/tenant/dashboard',   label: 'Home',        icon: '🏠' },
  { to: '/tenant/pay-rent',    label: 'Pay Rent',    icon: '💳' },
  { to: '/tenant/maintenance', label: 'Maintenance', icon: '🔧' },
  { to: '/tenant/documents',   label: 'Documents',   icon: '📁' },
  { to: '/tenant/messages',    label: 'Messages',    icon: '💬' },
]

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
      {initials || '?'}
    </div>
  )
}

export default function TenantLayout() {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()

  const displayName = profile?.full_name ?? profile?.email ?? 'Tenant'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shrink-0">
        <div>
          <span className="text-lg font-bold text-brand-600">FindStoop</span>
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide leading-none mt-0.5">
            Tenant Portal
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-gray-800">{displayName}</p>
            <button
              onClick={handleSignOut}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Sign out
            </button>
          </div>
          <Avatar name={displayName} />
        </div>
      </header>

      {/* Page */}
      <main className="flex-1 p-4 pb-24">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20">
        <div className="flex max-w-lg mx-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 pt-2 pb-3 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-brand-600' : 'text-gray-500'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`text-xl mb-0.5 transition-transform ${isActive ? 'scale-110' : ''}`}>
                    {item.icon}
                  </span>
                  <span className={isActive ? 'text-brand-600' : ''}>{item.label}</span>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-brand-600 rounded-full" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
