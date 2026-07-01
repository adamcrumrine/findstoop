// Focused, single-document shell for tenant-facing pages (view + sign).
//
// Deliberately bare: Stoop logo, who sent it, the document, and a way to
// reach the landlord. No app navigation, no upsell, no "sign up for Stoop"
// — tenants meet the product on their own terms.

import type { ReactNode } from 'react'
import EhoMark from './EhoMark'
import { BRAND } from '../../lib/brand'

interface DocPageShellProps {
  senderName: string
  propertyAddress?: string
  contactEmail?: string | null
  children: ReactNode
}

export default function DocPageShell({ senderName, propertyAddress, contactEmail, children }: DocPageShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-8 w-auto" />
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
      </footer>
    </div>
  )
}
