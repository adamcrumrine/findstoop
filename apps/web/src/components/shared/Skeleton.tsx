// Shared loading-skeleton primitives. Several pages grew identical local
// `Skeleton` helpers (Leases, Payments, tenant Dashboard, …) — new loading
// states should use these instead of adding another copy.

/** A single pulsing block. Size it with className (h-*, w-*). */
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`} />
}

/** A white card with a few pulsing lines — matches the app's list-card look. */
export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-2">
      <div className="h-5 bg-gray-200 rounded w-1/2" />
      <div className="h-4 bg-gray-200 rounded w-1/3" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
    </div>
  )
}

/** A stack of skeleton cards for list-page loading states. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}
