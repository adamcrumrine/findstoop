// Admin layout. Distinct from manager/tenant — dark sidebar, dense tables,
// monospace-y data feel. Routes off /admin/* and assumes ProtectedRoute
// has already enforced role='admin'.

import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Users, DollarSign, ShieldCheck,
  HeartHandshake, Cpu, LogOut, CreditCard, Funnel, MapPin, Menu, X, GraduationCap,
} from 'lucide-react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { BRAND } from '../../lib/brand'

const navLinks = [
  { to: '/admin/dashboard',     label: 'Dashboard',     Icon: LayoutDashboard },
  { to: '/admin/activity',      label: 'Activity',      Icon: Activity },
  { to: '/admin/visitors',      label: 'Visitors',      Icon: MapPin },
  { to: '/admin/users',         label: 'Users',         Icon: Users },
  { to: '/admin/subscriptions', label: 'Subscriptions', Icon: CreditCard },
  { to: '/admin/revenue',       label: 'Revenue',       Icon: DollarSign },
  { to: '/admin/funnel',        label: 'Funnel',        Icon: Funnel },
  { to: '/admin/renter-check',  label: 'Renter Check',  Icon: GraduationCap },
  { to: '/admin/screening',     label: 'Screening',     Icon: ShieldCheck },
  { to: '/admin/system',        label: 'System',        Icon: Cpu },
  { to: '/admin/feedback',      label: 'Feedback',      Icon: HeartHandshake },
]

export default function AdminLayout() {
  const { signOut, profile } = useAuth()
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close the drawer whenever the route changes — otherwise a tap on a
  // nav link leaves the overlay covering the page the user just opened.
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const handleSignOut = async () => {
    await signOut()
    // Hard-redirect prevents stale-state from re-triggering admin
    // route protection right after sign-out.
    window.location.href = '/login'
  }

  const sidebar = (
    <>
      <div className="px-5 pt-6 pb-5 border-b border-slate-800 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-white tracking-tight">{BRAND.name}</span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
              admin
            </span>
          </div>
          {profile && (
            <p className="text-[11px] text-slate-300 mt-1 truncate">{profile.full_name ?? 'admin'}</p>
          )}
        </div>
        {/* Close button visible only inside the mobile drawer */}
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="md:hidden -mr-2 -mt-2 p-2 text-slate-400 hover:text-white"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" strokeWidth={1.75} />
        </button>
      </div>

      <nav aria-label="Admin navigation" className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
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
    </>
  )

  return (
    <div className="min-h-dvh flex bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-brand-700 focus:text-white focus:px-3 focus:py-2 focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Permanent sidebar — md+ only */}
      <aside className="hidden md:flex w-56 shrink-0 bg-slate-900 text-slate-200 flex-col">
        {sidebar}
      </aside>

      {/* Mobile drawer — backdrop + sliding panel. Renders unconditionally
          so the transition animates open/close; pointer-events gated by
          the open state. */}
      <div
        className={`md:hidden fixed inset-0 z-40 transition-opacity ${
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
      >
        <div className="absolute inset-0 bg-black/50" />
      </div>
      <aside
        className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-64 bg-slate-900 text-slate-200 flex flex-col transform transition-transform duration-200 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!drawerOpen}
      >
        {sidebar}
      </aside>

      {/* Content + mobile top bar */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-2 px-3 py-2.5 bg-slate-900 text-white border-b border-slate-800">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="p-2 -ml-2 text-slate-200 hover:text-white"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" strokeWidth={1.75} />
          </button>
          <span className="text-sm font-bold tracking-tight">{BRAND.name}</span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
            admin
          </span>
        </div>
        <main id="main-content" key={pathname} className="flex-1 min-w-0 overflow-x-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
