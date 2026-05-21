import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import {
  LayoutGrid, Building2, DoorOpen, Users, FileText,
  CreditCard, Wrench, MessageSquare, Folder, BarChart3, MoreHorizontal,
  type LucideIcon,
} from 'lucide-react'

interface NavItem {
  to: string
  label: string
  Icon: LucideIcon
}

const navItems: NavItem[] = [
  { to: '/manager/dashboard',   label: 'Dashboard',   Icon: LayoutGrid },
  { to: '/manager/properties',  label: 'Properties',  Icon: Building2 },
  { to: '/manager/units',       label: 'Units',       Icon: DoorOpen },
  { to: '/manager/tenants',     label: 'Tenants',     Icon: Users },
  { to: '/manager/leases',      label: 'Leases',      Icon: FileText },
  { to: '/manager/payments',    label: 'Payments',    Icon: CreditCard },
  { to: '/manager/maintenance', label: 'Maintenance', Icon: Wrench },
  { to: '/manager/messages',    label: 'Messages',    Icon: MessageSquare },
  { to: '/manager/documents',   label: 'Documents',   Icon: Folder },
  { to: '/manager/reports',     label: 'Reports',     Icon: BarChart3 },
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
    <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
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
        ? 'bg-brand-50 text-brand-700 border-l-2 border-brand-500 rounded-l-none'
        : 'text-mute hover:bg-gray-50 hover:text-ink'
    }`

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Sidebar — desktop ─────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-gray-200 shrink-0">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-gray-100">
          <img src="/findstoop-logo.png" alt="FindStoop" className="h-8 w-auto" />
          <p className="text-[11px] text-mute mt-1.5 font-medium uppercase tracking-wide">Manager Portal</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {navItems.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={desktopLink}>
              <Icon className="w-5 h-5 shrink-0" strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 transition-colors">
            <Avatar name={displayName} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">{displayName}</p>
              <button
                onClick={handleSignOut}
                className="text-xs text-mute hover:text-red-500 transition-colors"
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
          <img src="/findstoop-logo.png" alt="FindStoop" className="h-7 w-auto" />
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
            {primaryNav.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center flex-1 pt-2 pb-3 text-[10px] font-medium transition-colors ${
                    isActive ? 'text-brand-600' : 'text-mute'
                  }`
                }
              >
                <Icon className="w-5 h-5 mb-0.5" strokeWidth={1.75} />
                {label}
              </NavLink>
            ))}

            {/* More button */}
            <button
              onClick={() => setMoreOpen((o) => !o)}
              className="flex flex-col items-center justify-center flex-1 pt-2 pb-3 text-[10px] font-medium text-mute"
            >
              <MoreHorizontal className="w-5 h-5 mb-0.5" strokeWidth={1.75} />
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
                  {moreNav.map(({ to, label, Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={() => setMoreOpen(false)}
                      className={({ isActive }) =>
                        `flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-medium transition-colors ${
                          isActive ? 'bg-brand-50 text-brand-700' : 'text-mute hover:bg-gray-50'
                        }`
                      }
                    >
                      <Icon className="w-6 h-6" strokeWidth={1.75} />
                      {label}
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
