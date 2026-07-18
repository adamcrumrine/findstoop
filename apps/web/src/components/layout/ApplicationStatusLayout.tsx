// Layout for the public applicant status tracker (`/application-status/:token`).
// Mirrors ApplyLayout: intentionally minimal — no marketing nav, no
// "My Account", no auth redirect. The applicant probably has no account, and
// a signed-in visitor (the landlord testing the link) shouldn't be redirected
// away from the page they're checking.
//
// Branding: the applicant is anonymous, so the landlord is resolved from the
// :token in the URL via the public get_application_public_status RPC — the
// same fetch the page needs for the status itself, so this layout owns the
// single RPC call and hands the result to the child route through Outlet
// context. Header follows ApplyLayout's convention (landlord logo → company
// name → build BRAND) and the accent palette is layered over the build brand
// while mounted.

import { useEffect } from 'react'
import { Link, Outlet, useMatch } from 'react-router-dom'
import PoweredByStoop from '../shared/PoweredByStoop'
import { BRAND, IS_WHITE_LABEL } from '../../lib/brand'
import { applyLandlordBrand, clearLandlordBrand } from '../../lib/landlordBrand'
import { useApplicationStatus, type ApplicationStatusResult } from '../../hooks/useApplicationStatus'

export interface ApplicationStatusOutletContext {
  loading: boolean
  result: ApplicationStatusResult | null
}

export default function ApplicationStatusLayout() {
  const match = useMatch('/application-status/:token')
  const { loading, result } = useApplicationStatus(match?.params.token)
  const landlord = result?.branding ?? null

  // Landlord accent color — same apply/clear contract as ApplyLayout so the
  // palette never leaks onto other layouts after navigation.
  useEffect(() => {
    if (!landlord?.brandColor) return
    applyLandlordBrand(landlord.brandColor)
    return () => clearLandlordBrand()
  }, [landlord?.brandColor])

  return (
    <div className="min-h-dvh flex flex-col bg-white">
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
            Application status
          </p>
        </div>
      </header>

      <main className="flex-1">
        <Outlet context={{ loading, result } satisfies ApplicationStatusOutletContext} />
      </main>

      <footer className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 py-4 text-xs text-mute flex flex-col sm:flex-row justify-between gap-1">
          <p>© {new Date().getFullYear()} {BRAND.legalName}</p>
          <p>This page shows progress only — your application details stay private.</p>
        </div>
        {/* Attribution — always on when another brand fronts the page
            (landlord branding or a white-label build), matching ApplyLayout. */}
        {(landlord || IS_WHITE_LABEL) && (
          <div className="flex justify-center border-t border-gray-100 py-2">
            <PoweredByStoop />
          </div>
        )}
      </footer>
    </div>
  )
}
