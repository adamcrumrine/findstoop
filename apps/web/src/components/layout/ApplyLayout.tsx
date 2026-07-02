// Layout for the public rental application (`/apply/:unitId`).
// Intentionally minimal — no marketing nav, no "My Account", no auth redirect.
// The prospect probably doesn't have a Stoop account yet, and even if a
// signed-in user (e.g. the landlord testing the link, or a tenant with a
// different rental) lands here, we don't want to redirect them away from
// the application they're trying to fill out.
//
// Branding: the applicant is anonymous, so the landlord is resolved from the
// :unitId in the URL via the public get_unit_public_brand RPC. This layout
// route is pathless — useParams here only sees params matched by the layout's
// own path (none), so we read the child route's :unitId with useMatch against
// the one route this layout wraps. Header follows TenantLayout's convention
// (landlord logo → company name → build BRAND) and the accent palette is
// layered over the build brand while mounted.

import { useEffect } from 'react'
import { Link, Outlet, useMatch } from 'react-router-dom'
import PoweredByStoop from '../shared/PoweredByStoop'
import { BRAND, IS_WHITE_LABEL } from '../../lib/brand'
import { applyLandlordBrand, clearLandlordBrand } from '../../lib/landlordBrand'
import { useUnitLandlordBrand } from '../../hooks/useUnitLandlordBrand'

export default function ApplyLayout() {
  const match = useMatch('/apply/:unitId')
  const landlord = useUnitLandlordBrand(match?.params.unitId)

  // Landlord accent color — same apply/clear contract as TenantLayout so the
  // palette never leaks onto other layouts after navigation.
  useEffect(() => {
    if (!landlord?.brandColor) return
    applyLandlordBrand(landlord.brandColor)
    return () => clearLandlordBrand()
  }, [landlord?.brandColor])

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          {/* Landlord branding wins when set: logo → company name → build brand. */}
          <Link to="/" aria-label={`${landlord?.companyName ?? BRAND.name} home`} className="block">
            {landlord?.logoUrl ? (
              <img
                src={landlord.logoUrl}
                alt={landlord.companyName ?? 'Your landlord'}
                className="h-9 max-w-[200px] w-auto object-contain"
              />
            ) : landlord?.companyName ? (
              <span className="block max-w-[220px] truncate text-lg font-semibold text-ink">
                {landlord.companyName}
              </span>
            ) : (
              <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-9 w-auto" />
            )}
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
        {/* Attribution — always on when another brand fronts the application
            (landlord branding or a white-label build), matching TenantLayout. */}
        {(landlord || IS_WHITE_LABEL) && (
          <div className="flex justify-center border-t border-gray-100 py-2">
            <PoweredByStoop />
          </div>
        )}
      </footer>
    </div>
  )
}
