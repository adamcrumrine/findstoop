// Admin layout. Distinct from manager/tenant — dark sidebar, dense tables,
// monospace-y data feel. Routes off /admin/* and assumes ProtectedRoute
// has already enforced role='admin'.

import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Users, DollarSign, ShieldCheck,
  HeartHandshake, Cpu, LogOut, CreditCard, Funnel,
} from 'lucide-react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'

const navLinks = [
  { to: '/admin/dashboard',     label: 'Dashboard',     Icon: LayoutDashboard },
  { to: '/admin/activity',      label: 'Activity',      Icon: Activity },
  { to: '/admin/users',         label: 'Users',         Icon: Users },
  { to: '/admin/subscriptions', label: 'Subscriptions', Icon: CreditCard },
  { to: '/admin/revenue',       label: 'Revenue',       Icon: DollarSign },
  { to: '/admin/funnel',        label: 'Funnel',        Icon: Funnel },
  { to: '/admin/screening',     label: 'Screening',     Icon: ShieldCheck },
  { to: '/admin/system',        label: 'System',        Icon: Cpu },
  { to: '/admin/feedback',      label: 'Feedback',      Icon: HeartHandshake },
]

export default function AdminLayout() {
  const { signOut, profile } = useAuth()
  const { pathname } = useLocation()

  const handleSignOut = async () => {
    await signOut()
    // Hard-redirect prevents stale-state from re-triggering admin
    // route protection right after sign-out.
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-slate-900 text-slate-200 flex flex-col">
        <div className="px-5 pt-6 pb-5 border-b border-slate-800">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-white tracking-tight">FindStoop</span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
              admin
            </span>
          </div>
          {profile && (
            <p className="text-[11px] text-slate-500 mt-1 truncate">{profile.full_name ?? 'admin'}</p>
          )}
        </div>

        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {navLinks.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`
              }
            >
              <Icon className="w-4 h-4" strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-800">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main key={pathname} className="flex-1 min-w-0 overflow-x-auto">
        <Outlet />
      </main>
    </div>
  )
}
