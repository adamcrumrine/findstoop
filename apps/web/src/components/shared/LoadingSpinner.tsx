// Branded full-screen loader shown during the seam between authentication
// and dashboard render — and also as the Suspense fallback for any lazy
// route chunk. Same component does both jobs so the user never sees two
// different "loading" treatments in a row.
//
// The animation is layered:
//   1. A soft conic gradient ring rotates around the logo (3s loop).
//   2. The logo itself does a subtle "breath" pulse (2s loop).
//   3. Three dots travel left-to-right beneath the message (1.2s loop).
// All three together read as "the app is alive and thinking," not as a
// frozen spinner.
//
// Mounted by ProtectedRoute (auth in flight) and App.tsx Suspense fallback
// (lazy chunk in flight). The `message` prop lets callers tailor copy if
// useful; the default is gentle enough for either case.

import { BRAND, brandColor } from '../../lib/brand'

interface LoadingSpinnerProps {
  message?: string
}

export default function LoadingSpinner({ message = 'Getting things ready…' }: LoadingSpinnerProps) {
  return (
    <div
      className="fs-loader-root fixed inset-0 z-50 flex items-center justify-center bg-white"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center">
        {/* Logo with rotating gradient ring */}
        <div className="relative w-24 h-24 flex items-center justify-center">
          {/* Outer rotating conic gradient — gives the ring a "spinning aurora" feel */}
          <div
            aria-hidden="true"
            className="fs-loader-ring absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg, transparent 200deg, ${brandColor('400')} 280deg, ${brandColor('400')} 320deg, transparent 360deg)`,
              filter: 'blur(0.5px)',
            }}
          />
          {/* Inner white mask so the gradient reads as a ring, not a disk */}
          <div className="absolute inset-[6px] rounded-full bg-white" aria-hidden="true" />
          {/* Logo */}
          <img
            src={BRAND.logo.square}
            alt=""
            aria-hidden="true"
            className="fs-loader-logo relative w-14 h-14 object-contain"
          />
        </div>

        {/* Message + traveling dots */}
        <p className="mt-6 text-sm font-medium text-ink">{message}</p>
        <div aria-hidden="true" className="mt-3 flex items-center gap-1.5">
          <span className="fs-loader-dot w-1.5 h-1.5 rounded-full bg-brand-500" style={{ animationDelay: '0s' }} />
          <span className="fs-loader-dot w-1.5 h-1.5 rounded-full bg-brand-500" style={{ animationDelay: '0.15s' }} />
          <span className="fs-loader-dot w-1.5 h-1.5 rounded-full bg-brand-500" style={{ animationDelay: '0.3s' }} />
        </div>

        <span className="sr-only">{message}</span>
      </div>

      {/* Keyframes are scoped via a class prefix so multiple loader mounts
          don't compound or conflict with other rotations. */}
      <style>{`
        @keyframes fs-loader-ring-spin   { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fs-loader-logo-breath { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes fs-loader-dot-bounce  { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-4px); opacity: 1; } }
        @keyframes fs-loader-fade-in     { from { opacity: 0; } to { opacity: 1; } }

        .fs-loader-root { animation: fs-loader-fade-in 200ms ease-out both; }
        .fs-loader-ring { animation: fs-loader-ring-spin   3s linear infinite; }
        .fs-loader-logo { animation: fs-loader-logo-breath 2s ease-in-out infinite; }
        .fs-loader-dot  { animation: fs-loader-dot-bounce 1.2s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .fs-loader-root,
          .fs-loader-ring,
          .fs-loader-logo,
          .fs-loader-dot { animation: none; }
        }
      `}</style>
    </div>
  )
}
