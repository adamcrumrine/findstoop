import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useTenantBadges } from '@findstoop/shared/hooks/useTenantBadges'
import { Home, CreditCard, Wrench, Folder, MessageSquare, Settings as SettingsIcon, LogOut, type LucideIcon } from 'lucide-react'
import TenantPaywallGate from '../shared/TenantPaywallGate'
import Avatar from '../shared/Avatar'

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
  { to: '/tenant/settings',    label: 'Settings',    Icon: SettingsIcon },
]

// One ambient illustration per route — sits large and washed-out behind the
// page's content cards to add depth without competing with them. Each route
// also nudges the illustration off-center so it peeks out from behind the
// centered content column rather than getting fully occluded. Messages gets
// the largest leftward nudge because its chat card spans most of the column.
// xPct: % of viewport to shift left from center.
// topRem: distance from top of the main area to the illustration. Most pages
// sit a bit below the header for breathing room; Messages pulls up tighter
// because the chat card is short and centered.
interface PageBg { name: string; xPct: number; topRem: number }
const PAGE_BG: Record<string, PageBg> = {
  '/tenant/dashboard':   { name: 'Houses-bro',           xPct: 22, topRem: -8 },
  '/tenant/pay-rent':    { name: 'Credit card-bro',     xPct: 22, topRem: -8 },
  '/tenant/maintenance': { name: 'roofer-bro',          xPct: 22, topRem: -8 },
  '/tenant/documents':   { name: 'Agreement-bro',       xPct: 22, topRem: -8 },
  '/tenant/messages':    { name: 'Mobile inbox-bro',    xPct: 38, topRem: -6 },
  '/tenant/settings':    { name: 'strelitzia plant-bro', xPct: 22, topRem: -8 },
}

export default function TenantLayout() {
  const { signOut, profile } = useAuth()
  const location = useLocation()
  const badges = useTenantBadges(profile?.id)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const pageBg = PAGE_BG[location.pathname] ?? null

  // Map of route → badge flag for the green cherry dot.
  const badgeFor = (to: string): boolean => {
    if (to === '/tenant/messages') return badges.messages
    if (to === '/tenant/documents') return badges.documents
    return false
  }

  const handleSignOut = async () => {
    setMenuOpen(false)
    await signOut()
    // Hard-redirect — avoids stale-state race in AuthProvider.
    window.location.href = '/login/renter'
  }

  // Click-outside to close the avatar menu.
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-brand-700 focus:text-white focus:px-3 focus:py-2 focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Header — logo on the left, avatar (with dropdown) on the right */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shrink-0">
        <Link to="/" aria-label="FindStoop home">
          <img src="/findstoop-logo.png" alt="FindStoop" className="h-10 w-auto" />
        </Link>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="block rounded-full focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <Avatar url={profile?.avatar_url} name={profile?.full_name} email={profile?.email} size={36} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-ink truncate">{profile?.full_name ?? 'Tenant'}</p>
                {profile?.email && (
                  <p className="text-xs text-mute truncate mt-0.5">{profile.email}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                role="menuitem"
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 inline-flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.75} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Page */}
      <main id="main-content" className="relative flex-1 p-4 pb-24 overflow-hidden">
        {/* One large, washed-out illustration anchored to this route. Lives
            in the absolute background layer so the page's cards sit on top
            and the illustration peeks out behind/around them. Hidden on
            small screens — too cramped for ambient art. */}
        {pageBg && (
          <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 hidden md:block z-0" style={{ top: `calc(4.5rem + ${pageBg.topRem}rem)` }}>
            <img
              src={`/illustrations/${pageBg.name}.png`}
              alt=""
              loading="lazy"
              className="w-[110%] max-w-[1100px] opacity-[0.10]"
              style={{ position: 'absolute', top: 0, left: `calc(50% - ${pageBg.xPct}vw)`, transform: 'translateX(-50%)' }}
            />
          </div>
        )}
        <div className="relative z-10">
          <TenantPaywallGate>
            <Outlet />
          </TenantPaywallGate>
        </div>
      </main>

      {/* Bottom nav */}
      <nav aria-label="Tenant primary navigation" className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-20">
        <div className="flex max-w-2xl mx-auto">
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
                  <div className="relative">
                    <Icon
                      className={`w-5 h-5 mb-0.5 transition-transform ${isActive ? 'scale-110' : ''}`}
                      strokeWidth={1.75}
                    />
                    {badgeFor(to) && (
                      <span
                        className="absolute -top-0.5 -right-1.5 w-2.5 h-2.5 bg-brand-500 rounded-full ring-2 ring-white"
                        aria-label="New activity"
                      />
                    )}
                  </div>
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
