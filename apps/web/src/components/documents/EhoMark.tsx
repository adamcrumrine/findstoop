// Equal Housing Opportunity mark — HUD's standard symbol (house outline with
// an "=" inside). The mark is a federal symbol, free to use in housing-industry
// contexts. Reused verbatim from the marketing footer so the treatment is
// consistent everywhere it's required (PDFs, tenant-facing pages).

interface EhoMarkProps {
  className?: string
  showLabel?: boolean
}

export default function EhoMark({ className = '', showLabel = true }: EhoMarkProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="w-7 h-7 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 11.5 L12 3.5 L21 11.5 V20.5 H3 Z" />
        <line x1="8" y1="13.5" x2="16" y2="13.5" />
        <line x1="8" y1="17" x2="16" y2="17" />
      </svg>
      {showLabel && (
        <span className="uppercase tracking-wider text-[10px] leading-tight">
          Equal Housing<br />Opportunity
        </span>
      )}
    </div>
  )
}
