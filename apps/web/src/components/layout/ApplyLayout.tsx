// Layout for the public rental application (`/apply/:unitId`).
// Intentionally minimal — no marketing nav, no "My Account", no auth redirect.
// The prospect probably doesn't have a Stoop account yet, and even if a
// signed-in user (e.g. the landlord testing the link, or a tenant with a
// different rental) lands here, we don't want to redirect them away from
// the application they're trying to fill out.

import { Link, Outlet } from 'react-router-dom'
import { BRAND } from '../../lib/brand'

export default function ApplyLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" aria-label={`${BRAND.name} home`} className="block">
            <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-9 w-auto" />
          </Link>
          <p className="text-xs uppercase tracking-wider text-mute font-semibold">
            Rental application
          </p>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 py-4 text-xs text-mute flex flex-col sm:flex-row justify-between gap-1">
          <p>© {new Date().getFullYear()} {BRAND.legalName}</p>
          <p>Your information is shared only with the landlord who sent you this link.</p>
        </div>
      </footer>
    </div>
  )
}
