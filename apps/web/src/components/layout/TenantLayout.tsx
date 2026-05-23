import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { Home, CreditCard, Wrench, Folder, MessageSquare, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'

interface NavItem {
  to: string
  label: string
  Icon: LucideIcon
}

const navItems: NavItem[] = [
  { to: '/tenant/dashboard',   label: 'Home',        Icon: Home },
  { to: '/tenant/pay-rent',    label: 'Pay Rent',    Icon: CreditCard },
  { to: '/tenant/maintenance', label: 'Maintenance', Icon: Wrench },
  { to: '/tenant/documents',   label: 'Documents',   Icon: Folder },
  { to: '/tenant/messages',    label: 'Messages',    Icon: MessageSquare },
]

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
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
        <div className="flex flex-col">
          <img src="/findstoop-logo.png" alt="FindStoop" className="h-7 w-auto" />
          <p className="text-[10px] text-mute font-medium uppercase tracking-wide mt-0.5">
            Tenant Portal
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/tenant/settings"
            className="text-mute hover:text-ink transition-colors p-1.5 rounded-lg hover:bg-gray-50"
            aria-label="Settings"
          >
            <SettingsIcon className="w-4 h-4" strokeWidth={1.75} />
          </Link>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-ink">{displayName}</p>
            <button
              onClick={handleSignOut}
              className="text-xs text-mute hover:text-red-500 transition-colors"
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
          {navItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center flex-1 pt-2 pb-3 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-brand-600' : 'text-mute'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-5 h-5 mb-0.5 transition-transform ${isActive ? 'scale-110' : ''}`}
                    strokeWidth={1.75}
                  />
                  <span>{label}</span>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-brand-500 rounded-full" />
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
