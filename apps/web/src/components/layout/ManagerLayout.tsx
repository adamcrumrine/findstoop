import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'

const navItems = [
  { to: '/manager/dashboard',   label: 'Dashboard',   icon: '⊞' },
  { to: '/manager/properties',  label: 'Properties',  icon: '🏢' },
  { to: '/manager/units',       label: 'Units',       icon: '🚪' },
  { to: '/manager/tenants',     label: 'Tenants',     icon: '👥' },
  { to: '/manager/leases',      label: 'Leases',      icon: '📄' },
  { to: '/manager/payments',    label: 'Payments',    icon: '💳' },
  { to: '/manager/maintenance', label: 'Maintenance', icon: '🔧' },
  { to: '/manager/messages',    label: 'Messages',    icon: '💬' },
  { to: '/manager/documents',   label: 'Documents',   icon: '📁' },
  { to: '/manager/reports',     label: 'Reports',     icon: '📊' },
]

const primaryNav = navItems.slice(0, 4)
const moreNav    = navItems.slice(4)

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

export default function ManagerLayout() {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  const displayName = profile?.full_name ?? profile?.email ?? 'Manager'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const desktopLink = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-colors ${
      isActive
        ? 'bg-brand-50 text-brand-700 border-l-2 border-brand-600 rounded-l-none'
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    }`

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Sidebar — desktop ─────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-gray-200 shrink-0">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-gray-100">
          <span className="text-xl font-bold text-brand-600 tracking-tight">FindStoop</span>
          <p className="text-[11px] text-gray-400 mt-0.5 font-medium uppercase tracking-wide">Manager Portal</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={desktopLink}>
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 transition-colors">
            <Avatar name={displayName} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
              <button
                onClick={handleSignOut}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile header */}
        <header className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 z-10">
          <span className="text-lg font-bold text-brand-600">FindStoop</span>
          <div className="flex items-center gap-3">
            <Avatar name={displayName} />
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
          <Outlet />
        </main>

        {/* ── Bottom nav — mobile ──────────────────────────────────────── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20">
          <div className="flex">
            {primaryNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center flex-1 pt-2 pb-3 text-[10px] font-medium transition-colors ${
                    isActive ? 'text-brand-600' : 'text-gray-500'
                  }`
                }
              >
                <span className="text-xl mb-0.5">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}

            {/* More button */}
            <button
              onClick={() => setMoreOpen((o) => !o)}
              className="flex flex-col items-center justify-center flex-1 pt-2 pb-3 text-[10px] font-medium text-gray-500"
            >
              <span className="text-xl mb-0.5">⋯</span>
              More
            </button>
          </div>

          {/* More drawer */}
          {moreOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMoreOpen(false)}
              />
              <div className="absolute bottom-full left-0 right-0 bg-white border-t border-gray-200 shadow-xl z-20 pb-2">
                <div className="grid grid-cols-3 gap-1 p-3">
                  {moreNav.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMoreOpen(false)}
                      className={({ isActive }) =>
                        `flex flex-col items-center gap-1 py-3 px-2 rounded-xl text-xs font-medium transition-colors ${
                          isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-50'
                        }`
                      }
                    >
                      <span className="text-2xl">{item.icon}</span>
                      {item.label}
                    </NavLink>
                  ))}
                </div>
                <div className="px-4 pb-1">
                  <button
                    onClick={handleSignOut}
                    className="w-full text-sm text-red-500 font-medium py-2 border border-red-100 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </nav>
      </div>
    </div>
  )
}
