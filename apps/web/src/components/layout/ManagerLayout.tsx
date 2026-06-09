import { useState } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import {
  LayoutGrid, Building2, Megaphone, ClipboardList, ShieldCheck,
  Users, FileText, CreditCard, Wrench, MessageSquare, Folder, BarChart3,
  Receipt, Settings as SettingsIcon, MoreHorizontal, Upload, Calculator, type LucideIcon,
} from 'lucide-react'
import Avatar from '../shared/Avatar'
import FeedbackModal from '../manager/FeedbackModal'
import NotificationsBell from '../manager/NotificationsBell'
import { MessageCircleQuestion } from 'lucide-react'

interface NavItem {
  to: string
  label: string
  Icon: LucideIcon
  group?: 'find' | 'manage' | 'operate' | 'insights' | 'account'
}

// Lifecycle-aligned: Find tenants → Manage relationships → Operate property → Insights
const navItems: NavItem[] = [
  { to: '/manager/dashboard',    label: 'Dashboard',    Icon: LayoutGrid,     group: 'manage' },
  { to: '/manager/properties',   label: 'Properties',   Icon: Building2,      group: 'manage' },
  { to: '/manager/listings',     label: 'Listings',     Icon: Megaphone,      group: 'find' },
  { to: '/manager/applications', label: 'Applications', Icon: ClipboardList,  group: 'find' },
  { to: '/manager/screening',    label: 'Screening',    Icon: ShieldCheck,    group: 'find' },
  { to: '/manager/tenants',      label: 'Tenants',      Icon: Users,          group: 'manage' },
  { to: '/manager/leases',       label: 'Leases',       Icon: FileText,       group: 'manage' },
  { to: '/manager/payments',     label: 'Payments',     Icon: CreditCard,     group: 'operate' },
  { to: '/manager/maintenance',  label: 'Maintenance',  Icon: Wrench,         group: 'operate' },
  { to: '/manager/messages',     label: 'Messages',     Icon: MessageSquare,  group: 'operate' },
  { to: '/manager/documents',    label: 'Documents',    Icon: Folder,         group: 'operate' },
  { to: '/manager/reports',      label: 'Reports',      Icon: BarChart3,      group: 'insights' },
  { to: '/manager/rental-analysis', label: 'Rental Analysis', Icon: Calculator, group: 'insights' },
  { to: '/manager/billing',      label: 'Billing',      Icon: Receipt,        group: 'insights' },
  { to: '/manager/import',       label: 'Import',       Icon: Upload,         group: 'account' },
  { to: '/manager/settings',     label: 'Settings',     Icon: SettingsIcon,   group: 'account' },
]

// One ambient illustration per route — same treatment as the tenant side.
// Large, washed-out, fixed below the header, nudged off-center so it peeks
// behind/around the content column. Hidden under md (no room to fade).
// Every illustration is used at most once across the manager side. Routes
// that don't pair cleanly with a unique illustration (units / documents /
// settings) just render plain — better than recycling artwork. Dynamic
// routes (properties/:id, tenants/:id, review-lease) fall back via bgFor()
// to share the look of their list page (those list pages get the dedicated
// illustration, the detail pages get none of their own).
// opacity is optional — defaults to 0.10. Routes with a tighter content
// column (messages: chat bubbles span most of the page) need a fainter
// wash so the artwork doesn't compete with the live content.
interface PageBg { name: string; xPct: number; topRem: number; opacity?: number }
const PAGE_BG: Record<string, PageBg> = {
  '/manager/dashboard':    { name: 'Houses-bro',              xPct: 22, topRem: -8 },
  '/manager/properties':   { name: 'City skyline-bro',        xPct: 22, topRem: -5 },
  '/manager/units':        { name: 'Navigation-amico',        xPct: 22, topRem: -8 },
  '/manager/listings':     { name: 'House searching-bro',     xPct: 22, topRem: -8 },
  '/manager/applications': { name: 'Accept terms-bro',        xPct: 22, topRem: -8 },
  '/manager/screening':    { name: 'About us page-bro',       xPct: 22, topRem: -8 },
  '/manager/tenants':      { name: 'Moving-bro',              xPct: 22, topRem: -8 },
  '/manager/leases':       { name: 'Signing a contract-bro',  xPct: 22, topRem: -8 },
  '/manager/payments':     { name: 'Payment Information-bro', xPct: 22, topRem: -8 },
  '/manager/maintenance':  { name: 'Maintenance-bro',         xPct: 22, topRem: -8 },
  '/manager/messages':     { name: 'Texting-bro',             xPct: 38, topRem: -6, opacity: 0.04 },
  '/manager/documents':    { name: 'Agreement-bro',           xPct: 22, topRem: -8 },
  '/manager/reports':      { name: 'Accountant-bro',          xPct: 22, topRem: -8 },
  '/manager/billing':      { name: 'Pricing plans-bro',       xPct: 22, topRem: -8 },
  '/manager/settings':     { name: 'Features Overview-bro',   xPct: 22, topRem: -8 },
}

function bgFor(pathname: string): PageBg | null {
  if (PAGE_BG[pathname]) return PAGE_BG[pathname]
  // Dynamic routes — reuse the parent list's illustration (the only
  // sanctioned image-reuse on the manager side, since the detail pages
  // share the same theme as their parent list).
  if (pathname.startsWith('/manager/properties/')) return PAGE_BG['/manager/properties']
  if (pathname.startsWith('/manager/tenants/'))    return PAGE_BG['/manager/tenants']
  if (pathname.startsWith('/manager/review-lease'))return PAGE_BG['/manager/leases']
  return null
}

// Mobile bottom nav: 4 most-used items
const primaryNav = [
  navItems.find((n) => n.to === '/manager/dashboard')!,
  navItems.find((n) => n.to === '/manager/properties')!,
  navItems.find((n) => n.to === '/manager/leases')!,
  navItems.find((n) => n.to === '/manager/payments')!,
]
const moreNav = navItems.filter((n) => !primaryNav.includes(n))

export default function ManagerLayout() {
  const { signOut, profile } = useAuth()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const pageBg = bgFor(location.pathname)

  const displayName = profile?.full_name ?? profile?.email ?? 'Manager'

  const handleSignOut = async () => {
    await signOut()
    // Hard-redirect — React-Router navigate() can race with AuthProvider's
    // listener and leave stale profile state hanging around, which then
    // gets caught by ProtectedRoute on the next render and bounces the
    // user right back to a protected route.
    window.location.href = '/login'
  }

  const desktopLink = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-colors ${
      isActive
        ? 'bg-brand-50 text-brand-700 border-l-2 border-brand-500 rounded-l-none'
        : 'text-mute hover:bg-gray-50 hover:text-ink'
    }`

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-brand-700 focus:text-white focus:px-3 focus:py-2 focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* ── Sidebar — desktop ─────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-gray-200 shrink-0">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-gray-100">
          <Link to="/" aria-label="Stoop home" className="block">
            <img src="/stoop_logo_horizontal_trans.png" alt="Stoop" className="h-12 w-auto" />
          </Link>
          <p className="text-[11px] text-mute mt-1.5 font-medium uppercase tracking-wide">Manager Portal</p>
        </div>

        {/* Nav — grouped by landlord lifecycle stage */}
        <nav aria-label="Manager primary navigation" className="flex-1 overflow-y-auto px-2 py-3">
          {(['manage', 'find', 'operate', 'insights', 'account'] as const).map((group, gi) => {
            const items = navItems.filter((n) => n.group === group)
            if (!items.length) return null
            const label = { manage: 'Manage', find: 'Find Tenants', operate: 'Operate', insights: 'Insights', account: 'Account' }[group]
            return (
              <div key={group} className={gi === 0 ? '' : 'mt-4'}>
                <p className="px-3 mb-1.5 text-[10px] font-semibold text-mute-400 uppercase tracking-wider">
                  {label}
                </p>
                {items.map(({ to, label, Icon }) => (
                  <NavLink key={to} to={to} className={desktopLink}>
                    <Icon className="w-5 h-5 shrink-0" strokeWidth={1.75} />
                    {label}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>

        {/* User footer + Send feedback */}
        <div className="p-3 border-t border-gray-100 space-y-1">
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="w-full inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-mute hover:text-ink hover:bg-gray-50 rounded-lg transition-colors"
          >
            <MessageCircleQuestion className="w-4 h-4" strokeWidth={1.75} />
            Send feedback
          </button>
          <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 transition-colors">
            <Avatar url={profile?.company_logo_url ?? profile?.avatar_url} name={profile?.company_name ?? profile?.full_name} email={profile?.email} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">{displayName}</p>
              <button
                onClick={handleSignOut}
                className="text-xs text-mute hover:text-red-500 transition-colors"
              >
                Sign out
              </button>
            </div>
            <NotificationsBell />
          </div>
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile header — extra top padding via env(safe-area-inset-top)
            so the bar clears the iOS notch / Android status bar. */}
        <header
          className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 z-10"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
        >
          <Link to="/" aria-label="Stoop home" className="block">
            <img src="/stoop_logo_horizontal_trans.png" alt="Stoop" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <Avatar url={profile?.company_logo_url ?? profile?.avatar_url} name={profile?.company_name ?? profile?.full_name} email={profile?.email} size={32} />
          </div>
        </header>

        {/* Page */}
        <main id="main-content" className="relative flex-1 overflow-y-auto p-4 md:p-6 pb-28 md:pb-6 lg:pr-24 xl:pr-40">
          {/* Ambient background illustration — shifted to the RIGHT of the
              centered content column because the left side is occupied by
              the sidebar. xPct values come from PAGE_BG. */}
          {pageBg && (
            <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 hidden md:block z-0" style={{ top: `calc(4.5rem + ${pageBg.topRem}rem)` }}>
              <img
                src={`/illustrations/${pageBg.name}.png`}
                alt=""
                loading="lazy"
                className="w-[110%] max-w-[1100px]"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: `calc(50% + ${pageBg.xPct}vw)`,
                  transform: 'translateX(-50%)',
                  opacity: pageBg.opacity ?? 0.10,
                }}
              />
            </div>
          )}
          <div className="relative z-10">
            <Outlet />
          </div>
        </main>

        {/* ── Bottom nav — mobile ──────────────────────────────────────── */}
        {/* Bottom nav adds safe-area-inset padding so the row clears the
            iOS home indicator. pt-3 + pb-3 (+ env inset) gives each tap
            target ~52px high — Apple HIG minimum is 44, Material is 48. */}
        <nav aria-label="Manager mobile navigation" className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex">
            {primaryNav.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center flex-1 pt-3 pb-3 text-[10px] font-medium transition-colors ${
                    isActive ? 'text-brand-600' : 'text-mute'
                  }`
                }
              >
                <Icon className="w-5 h-5 mb-1" strokeWidth={1.75} />
                {label}
              </NavLink>
            ))}

            {/* More button */}
            <button
              onClick={() => setMoreOpen((o) => !o)}
              className="flex flex-col items-center justify-center flex-1 pt-3 pb-3 text-[10px] font-medium text-mute"
            >
              <MoreHorizontal className="w-5 h-5 mb-1" strokeWidth={1.75} />
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
                  {/* Feedback opens the FeedbackModal — keeps parity with
                      the desktop sidebar's "Send feedback" affordance. */}
                  <button
                    type="button"
                    onClick={() => { setMoreOpen(false); setFeedbackOpen(true) }}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-medium text-mute hover:bg-gray-50 transition-colors"
                  >
                    <MessageCircleQuestion className="w-6 h-6" strokeWidth={1.75} />
                    Feedback
                  </button>
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

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  )
}
