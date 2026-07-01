// Branded role-picker — the "are you a landlord or a renter?" gate that
// routes users to the correct auth form before they see anything else.
// Inspired by Avail's /login splash, but sleeker and on-brand.
//
// Reached via the marketing nav "Sign in" button or by deep-linking to
// /welcome. If we already know the role (e.g. an OAuth redirect came back
// with a profile), we skip the picker and bounce straight to the dashboard.

import { Link, Navigate } from 'react-router-dom'
import { Building2, Home, ArrowRight, LogIn } from 'lucide-react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { defaultPathForRole } from '../../lib/roleRouting'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { useSeo } from '../../lib/useSeo'
import { BRAND } from '../../lib/brand'

export default function Welcome() {
  useSeo({
    title: `Sign in to ${BRAND.name}`,
    description: `Sign in as a landlord or renter to access your ${BRAND.name} dashboard, pay rent, sign leases, and manage your rental.`,
    path: '/welcome',
  })

  const { user, profile, loading } = useAuth()

  // Already signed in — bounce them home so they don't have to pick a role
  // that's already decided. Falls through to the picker if profile lookup
  // is still in flight.
  if (user && !profile) {
    return <LoadingSpinner message="Signing you in…" />
  }
  if (!loading && user && profile) {
    return <Navigate to={defaultPathForRole(profile.role)} replace />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-brand-50 flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgb(var(--brand-grad-from)/0.10),transparent_60%)] pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Logo + heading */}
        <div className="text-center mb-8">
          <Link to="/" aria-label={`${BRAND.name} home`} className="inline-block hover:opacity-80 transition-opacity">
            <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-16 w-auto mx-auto" />
          </Link>
          <h1 className="text-3xl font-bold text-ink mt-6 tracking-tight">Welcome back.</h1>
          <p className="text-sm text-mute mt-2">Pick the account type that fits, and we'll take you to the right place.</p>
        </div>

        {/* Role cards */}
        <div className="space-y-3">
          <RoleCard
            to="/login"
            Icon={Building2}
            title="I'm a landlord"
            subtitle="Manage properties, screen applicants, collect rent"
            accent="brand"
          />
          <RoleCard
            to="/login/renter"
            Icon={Home}
            title="I'm a renter"
            subtitle="Pay rent, message your landlord, access your lease"
            accent="ink"
          />
        </div>

        {/* New here? */}
        <div className="mt-8 text-center bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs uppercase tracking-wider text-mute font-semibold mb-2">New to {BRAND.name}?</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-brand-700 hover:bg-brand-50 transition-colors"
            >
              Create a landlord account
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
            </Link>
            <span className="hidden sm:block text-mute/40">·</span>
            <Link
              to="/register/renter"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-ink hover:bg-gray-50 transition-colors"
            >
              Create a renter account
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="text-[11px] text-mute/70 text-center mt-6">
          By signing in you agree to our{' '}
          <Link to="/terms" className="text-mute hover:text-ink underline underline-offset-2">Terms</Link>
          {' '}and{' '}
          <Link to="/privacy" className="text-mute hover:text-ink underline underline-offset-2">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  )
}

// ── Role card ─────────────────────────────────────────────────────────────
function RoleCard({
  to, Icon, title, subtitle, accent,
}: {
  to: string
  Icon: typeof Building2
  title: string
  subtitle: string
  accent: 'brand' | 'ink'
}) {
  const isBrand = accent === 'brand'
  return (
    <Link
      to={to}
      className={`group flex items-center gap-4 p-5 rounded-2xl border-2 transition-all hover:shadow-sm ${
        isBrand
          ? 'border-brand-200 bg-white hover:border-brand-400'
          : 'border-gray-200 bg-white hover:border-gray-400'
      }`}
    >
      <div className={`shrink-0 w-12 h-12 rounded-xl inline-flex items-center justify-center ${
        isBrand ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-ink'
      }`}>
        <Icon className="w-6 h-6" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ink inline-flex items-center gap-2">
          {title}
          <LogIn className="w-3.5 h-3.5 text-mute opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={2} />
        </p>
        <p className="text-xs text-mute mt-0.5 leading-relaxed">{subtitle}</p>
      </div>
      <ArrowRight className={`w-5 h-5 transition-transform group-hover:translate-x-0.5 ${
        isBrand ? 'text-brand-600' : 'text-mute'
      }`} strokeWidth={2} />
    </Link>
  )
}
