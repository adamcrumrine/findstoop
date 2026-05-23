import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  // File slug under /public/illustrations/ (without extension).
  name: string
  // Lucide icon used when the illustration isn't present yet.
  Fallback: LucideIcon
  title?: string
  subtitle?: string
  // Tailwind size on the illustration container. Defaults to a comfortable
  // 240px wide block so it fills the white space without dominating.
  size?: 'md' | 'lg'
}

// Larger empty-state block: brand-tinted gradient panel with the
// illustration, plus optional title + subtitle. Reuses the marketing
// illustrations under /public/illustrations/.
export default function EmptyIllustration({ name, Fallback, title, subtitle, size = 'lg' }: Props) {
  const [error, setError] = useState(false)
  const sizeCls = size === 'lg' ? 'w-56 h-56 md:w-64 md:h-64' : 'w-40 h-40'

  return (
    <div className="flex flex-col items-center text-center py-8 px-6">
      <div className={`relative ${sizeCls} rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-brand-50 overflow-hidden`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(0,168,150,0.10),transparent_60%)]" />
        {error ? (
          <div className="relative h-full w-full flex items-center justify-center">
            <Fallback className="w-20 h-20 text-brand-600/50" strokeWidth={1.2} />
          </div>
        ) : (
          <img
            src={`/illustrations/${name}.png`}
            alt=""
            loading="lazy"
            onError={() => setError(true)}
            className="absolute inset-0 w-full h-full object-contain p-6"
          />
        )}
      </div>
      {title && <p className="text-base font-semibold text-ink mt-5">{title}</p>}
      {subtitle && <p className="text-sm text-mute mt-1 max-w-xs leading-relaxed">{subtitle}</p>}
    </div>
  )
}
