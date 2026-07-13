import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useTenantBadges } from '@findstoop/shared/hooks/useTenantBadges'
import { Home, CreditCard, Wrench, Folder, MessageSquare, Settings as SettingsIcon, LogOut, type LucideIcon } from 'lucide-react'
import TenantPaywallGate from '../shared/TenantPaywallGate'
import Avatar from '../shared/Avatar'
import PoweredByStoop from '../shared/PoweredByStoop'
import InstallPrompt from '../shared/InstallPrompt'
import { BRAND, IS_WHITE_LABEL } from '../../lib/brand'
import { applyLandlordBrand, clearLandlordBrand } from '../../lib/landlordBrand'
import { useLandlordBranding } from '../../hooks/useLandlordBranding'

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
  const landlord = useLandlordBranding(profile?.id)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const pageBg = PAGE_BG[location.pathname] ?? null

  // Landlord accent color — layered over the build brand's --brand-* palette
  // while the tenant portal is mounted; cleanup restores the build palette so
  // it never leaks onto other layouts after sign-out / route changes.
  useEffect(() => {
    if (!landlord?.brandColor) return
    applyLandlordBrand(landlord.brandColor)
    return () => clearLandlordBrand()
  }, [landlord?.brandColor])

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

      {/* Header — logo left, avatar right. env(safe-area-inset-top)
          padding clears the iOS notch / Android status bar.
          With landlord branding the header becomes THEIR surface: accent
          background (the derived 600 step is contrast-guaranteed for white
          text), circle-cropped logo, "{Company} Rental Portal" lockup. */}
      <header
        className={`px-4 py-3 flex items-center justify-between sticky top-0 z-30 shrink-0 ${
          landlord ? 'bg-brand-600 shadow-sm' : 'bg-white border-b border-gray-200'
        }`}
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <Link to="/" aria-label={`${landlord?.companyName ?? BRAND.name} home`} className="min-w-0">
          {landlord ? (
            <span className="flex items-center gap-2.5 min-w-0">
              {landlord.logoUrl ? (
                <img
                  src={landlord.logoUrl}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover bg-white ring-2 ring-white/30 shrink-0"
                />
              ) : (
                <span className="w-10 h-10 rounded-full bg-white/15 ring-2 ring-white/30 text-white font-bold text-lg inline-flex items-center justify-center shrink-0">
                  {(landlord.companyName ?? 'R').charAt(0).toUpperCase()}
                </span>
              )}
              <span className="min-w-0">
                {landlord.companyName && (
                  <span className="block text-white font-semibold leading-tight truncate max-w-[200px]">
                    {landlord.companyName}
                  </span>
                )}
                <span className={`block text-white/70 leading-tight ${landlord.companyName ? 'text-[11px]' : 'text-base font-semibold text-white'}`}>
                  Rental Portal
                </span>
              </span>
            </span>
          ) : (
            <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-10 w-auto" />
          )}
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
      <main id="main-content" className="relative flex-1 p-4 pb-28 overflow-hidden">
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

      {/* Bottom nav — safe-area inset clears the iOS home indicator. Branded
          portals get the accent surface here too (700 step: darker than the
          header, so white text clears contrast with room to spare). */}
      <nav
        aria-label="Tenant primary navigation"
        className={`fixed bottom-0 left-0 right-0 z-20 ${landlord ? 'bg-brand-700' : 'bg-white border-t border-gray-200'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex max-w-2xl mx-auto">
          {navItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center flex-1 pt-3 pb-3 text-[10px] font-medium transition-colors ${
                  landlord
                    ? isActive ? 'text-white' : 'text-white/60 hover:text-white/85'
                    : isActive ? 'text-brand-600' : 'text-mute'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <Icon
                      className={`w-5 h-5 mb-1 transition-transform ${isActive ? 'scale-110' : ''}`}
                      strokeWidth={1.75}
                    />
                    {badgeFor(to) && (
                      <span
                        className={`absolute -top-0.5 -right-1.5 w-2.5 h-2.5 rounded-full ring-2 ${
                          landlord ? 'bg-white ring-brand-700' : 'bg-brand-500 ring-white'
                        }`}
                        aria-label="New activity"
                      />
                    )}
                  </div>
                  <span>{label}</span>
                  {isActive && (
                    <span className={`absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${landlord ? 'bg-white' : 'bg-brand-500'}`} />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
        {/* Attribution — always on when another brand fronts the portal
            (landlord branding or a white-label build). Lives inside the fixed
            nav so it stays visible without its own layout band. */}
        {(landlord || IS_WHITE_LABEL) && (
          <div className={`flex justify-center py-1 ${landlord ? 'bg-white/95 border-t border-white/20' : 'border-t border-gray-100'}`}>
            <PoweredByStoop />
          </div>
        )}
      </nav>

      {/* Add-to-home-screen nudge — second visit, dismissible, phone-first. */}
      <InstallPrompt />
    </div>
  )
}
