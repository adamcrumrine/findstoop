// Focused, single-document shell for tenant-facing pages (view + sign).
//
// Deliberately bare: Stoop logo, who sent it, the document, and a way to
// reach the landlord. No app navigation, no upsell, no "sign up for Stoop"
// — tenants meet the product on their own terms.
//
// When the caller resolves landlord branding (useLandlordBranding), the
// header follows TenantLayout's convention — landlord logo → company name →
// build BRAND — with a "Powered by" attribution in the footer.

import type { ReactNode } from 'react'
import EhoMark from './EhoMark'
import PoweredByStoop from '../shared/PoweredByStoop'
import { BRAND, IS_WHITE_LABEL } from '../../lib/brand'
import type { LandlordBranding } from '../../hooks/useLandlordBranding'

interface DocPageShellProps {
  senderName: string
  propertyAddress?: string
  contactEmail?: string | null
  /** Landlord branding for the header lockup; null/omitted → build BRAND. */
  landlord?: LandlordBranding | null
  children: ReactNode
}

export default function DocPageShell({ senderName, propertyAddress, contactEmail, landlord = null, children }: DocPageShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          {/* Landlord branding wins when set: logo → company name → build brand. */}
          {landlord?.logoUrl ? (
            <img
              src={landlord.logoUrl}
              alt={landlord.companyName ?? 'Your landlord'}
              className="h-8 max-w-[180px] w-auto object-contain"
            />
          ) : landlord?.companyName ? (
            <span className="max-w-[200px] truncate text-base font-semibold text-ink">
              {landlord.companyName}
            </span>
          ) : (
            <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-8 w-auto" />
          )}
          <p className="text-xs text-mute text-right truncate">
            Sent by {senderName}{propertyAddress ? <> · <span className="hidden sm:inline">{propertyAddress}</span></> : null}
          </p>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <EhoMark className="text-mute" />
          <p className="text-xs text-mute text-right">
            Questions?{' '}
            {contactEmail
              ? <>Contact your landlord at <a href={`mailto:${contactEmail}`} className="text-brand-600 hover:underline">{contactEmail}</a></>
              : 'Contact your landlord.'}
          </p>
        </div>
        {/* Attribution — always on when another brand fronts the page
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
