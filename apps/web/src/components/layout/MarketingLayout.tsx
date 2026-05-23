import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, Navigate } from 'react-router-dom'
import { Menu, X, UserCircle2 } from 'lucide-react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'

const navLinks = [
  { to: '/pricing',   label: 'Pricing' },
  { to: '/',          label: 'Landlords', exact: true },
  { to: '/tenants',   label: 'Tenants' },
  { to: '/education', label: 'Education' },
]

export default function MarketingLayout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { user, profile, loading } = useAuth()

  // If a signed-in user lands on the marketing site (most commonly after the
  // Google OAuth callback drops them on "/" instead of "/login"), bounce them
  // straight to their dashboard. Wait for profile so we route to the right one.
  if (!loading && user && profile) {
    return <Navigate to={profile.role === 'tenant' ? '/tenant/dashboard' : '/manager/dashboard'} replace />
  }

  const myAccountHref =
    !user ? '/login'
      : profile?.role === 'tenant' ? '/tenant/dashboard'
      : '/manager/dashboard'

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors ${
      isActive ? 'text-brand-600' : 'text-ink hover:text-brand-600'
    }`

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 h-24 flex items-center justify-between">
          <Link to="/" className="flex items-center" aria-label="FindStoop home">
            <img src="/findstoop-logo.png" alt="FindStoop" className="h-14 w-auto" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.exact} className={navClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link
              to={myAccountHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:text-brand-600 transition-colors"
            >
              <UserCircle2 className="w-4 h-4" strokeWidth={1.75} />
              My Account
            </Link>
            <Link
              to="/register"
              className="text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 px-4 py-2 rounded-lg transition-colors"
            >
              Get started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="md:hidden p-2 -mr-2 text-ink"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="w-6 h-6" strokeWidth={1.75} /> : <Menu className="w-6 h-6" strokeWidth={1.75} />}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="md:hidden border-t border-gray-100 bg-white px-5 py-4">
            <nav className="flex flex-col gap-3">
              {navLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.exact}
                  onClick={() => setOpen(false)}
                  className="text-base font-medium text-ink py-1"
                >
                  {l.label}
                </NavLink>
              ))}
              <hr className="my-2 border-gray-100" />
              <Link to={myAccountHref} onClick={() => setOpen(false)} className="text-base font-medium text-ink py-1 inline-flex items-center gap-1.5">
                <UserCircle2 className="w-4 h-4" strokeWidth={1.75} />
                My Account
              </Link>
              <Link
                to="/register"
                onClick={() => setOpen(false)}
                className="text-center text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 px-4 py-2.5 rounded-lg transition-colors"
              >
                Get started
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* ── Page content ──────────────────────────────────────────────── */}
      <main key={pathname} className="flex-1">
        <Outlet />
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="bg-ink text-white mt-16">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          <div className="col-span-2">
            <img src="/findstoop-logo.png" alt="FindStoop" className="h-7 w-auto brightness-0 invert mb-3" />
            <p className="text-white/60 max-w-xs">
              The all-in-one rental platform for landlords who'd rather collect rent
              than chase it.
            </p>
          </div>
          <div>
            <p className="font-semibold mb-3 text-white">Product</p>
            <ul className="space-y-2 text-white/70">
              <li><Link to="/" className="hover:text-white transition-colors">For landlords</Link></li>
              <li><Link to="/tenants" className="hover:text-white transition-colors">For tenants</Link></li>
              <li><Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
              <li><Link to="/education" className="hover:text-white transition-colors">Education</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-3 text-white">Get started</p>
            <ul className="space-y-2 text-white/70">
              <li><Link to="/register" className="hover:text-white transition-colors">Landlord sign up</Link></li>
              <li><Link to="/register/renter" className="hover:text-white transition-colors">Renter sign up</Link></li>
              <li><Link to="/login" className="hover:text-white transition-colors">Log in</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-5 lg:px-8 py-5 text-xs text-white/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p>© {new Date().getFullYear()} FindStoop. All rights reserved.</p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5">
              <p>Made for landlords with better things to do.</p>
              <p className="text-white/40">
                <a
                  href="https://storyset.com/home"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-white/70"
                >
                  Home illustrations by Storyset
                </a>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
