export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen" role="status" aria-live="polite">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-brand-500 border-t-transparent" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
