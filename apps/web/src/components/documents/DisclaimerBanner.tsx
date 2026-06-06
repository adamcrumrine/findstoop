// The plain-English "not legal advice" disclaimer. Shown on every document
// preview (the compliance rule: no generated document may claim to be legal
// advice). Tone matches the brand voice — peer-to-peer, no jargon.

import { Info } from 'lucide-react'

interface DisclaimerBannerProps {
  className?: string
}

export default function DisclaimerBanner({ className = '' }: DisclaimerBannerProps) {
  return (
    <div className={`flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 ${className}`}>
      <Info className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <p className="text-sm text-amber-800 leading-relaxed">
        We built this from your property data. Give it a careful read before you send it —
        Stoop doesn't provide legal advice.
      </p>
    </div>
  )
}
