// "Powered by Stoop" co-brand lockup — brand wordmark treatment (teal brand-600,
// tight tracking, bold), to sit alongside a partner's logo on white-labeled /
// co-branded surfaces (e.g. a university off-campus housing portal).

interface PoweredByStoopProps {
  className?: string
  size?: 'sm' | 'md'
}

export default function PoweredByStoop({ className = '', size = 'sm' }: PoweredByStoopProps) {
  const text = size === 'md' ? 'text-sm' : 'text-xs'
  const mark = size === 'md' ? 'text-base' : 'text-sm'
  return (
    <span className={`inline-flex items-baseline gap-1 ${text} text-mute ${className}`}>
      Powered by
      <span className={`font-bold tracking-tight text-brand-600 ${mark}`}>Stoop</span>
    </span>
  )
}
