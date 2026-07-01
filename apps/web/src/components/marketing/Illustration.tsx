import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  /** File slug under /public/illustrations/ (without extension). */
  name: string
  /** Lucide icon used when the SVG isn't present yet. */
  Fallback: LucideIcon
  className?: string
}

/**
 * Renders a marketing illustration from /public/illustrations/{name}.svg.
 * Falls back to a brand-gradient panel with a lucide icon if the SVG is
 * missing, so the page never shows a broken image while we're staging assets.
 */
export default function Illustration({ name, Fallback, className }: Props) {
  const [error, setError] = useState(false)

  const wrapperClass =
    `relative aspect-[4/3] rounded-2xl border border-brand-100 overflow-hidden ` +
    `bg-gradient-to-br from-brand-50 via-white to-brand-50 ` +
    (className ?? '')

  if (error) {
    return (
      <div className={wrapperClass}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgb(var(--brand-grad-from)/0.10),transparent_60%)]" />
        <div className="relative h-full w-full flex items-center justify-center p-12">
          <Fallback className="w-24 h-24 text-brand-600/50" strokeWidth={1.2} />
        </div>
      </div>
    )
  }

  return (
    <div className={wrapperClass}>
      <img
        src={`/illustrations/${name}.png`}
        alt=""
        loading="lazy"
        onError={() => setError(true)}
        className="absolute inset-0 w-full h-full object-contain p-6"
      />
    </div>
  )
}
