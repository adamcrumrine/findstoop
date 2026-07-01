import { Link } from 'react-router-dom'
import { ArrowRight, CreditCard, Wrench, FileSignature, KeyRound, MessageSquare, ShieldCheck } from 'lucide-react'
import { BRAND } from '../../lib/brand'
import { useSeo } from '../../lib/useSeo'

// Homepage for portal-experience brands (see brand.ts): a property company's
// own front door. Residents get straight-to-action cards instead of the SaaS
// marketing pitch that Home.tsx serves for the default brand.
export default function PortalHome() {
  useSeo({
    title: 'Resident portal',
    description: BRAND.description,
    path: '/',
  })

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/70 to-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgb(var(--brand-grad-from)/0.10),transparent_60%)] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-5 lg:px-8 pt-16 pb-14 lg:pt-24 lg:pb-20 text-center">
          <h1 className="text-4xl lg:text-6xl font-bold text-ink tracking-tight">
            {BRAND.portal?.headline ?? `Welcome to ${BRAND.name}`}
          </h1>
          <p className="mt-5 text-lg text-mute max-w-2xl mx-auto">
            {BRAND.portal?.subline ?? BRAND.tagline}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/login/renter"
              className="inline-flex items-center gap-2 text-white bg-brand-500 hover:bg-brand-600 font-medium px-6 py-3 rounded-xl transition-colors"
            >
              Resident sign in
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
            <Link
              to="/register/renter"
              className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 bg-white border border-brand-200 hover:border-brand-300 font-medium px-6 py-3 rounded-xl transition-colors"
            >
              Create a resident account
            </Link>
          </div>
        </div>
      </section>

      {/* ── Resident actions ──────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 lg:px-8 py-14 lg:py-20">
        <h2 className="text-2xl lg:text-3xl font-bold text-ink text-center">
          Everything about your home, online
        </h2>
        <p className="mt-3 text-mute text-center max-w-xl mx-auto">
          Sign in once and handle it all — no phone tag, no paper checks.
        </p>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <ActionCard
            Icon={CreditCard}
            title="Pay rent"
            body="Free ACH transfers, automatic receipts, and payment history you can export any time."
          />
          <ActionCard
            Icon={Wrench}
            title="Request maintenance"
            body="Report an issue with photos in under a minute and track progress until it's fixed."
          />
          <ActionCard
            Icon={FileSignature}
            title="Sign your lease"
            body="Review and e-sign your lease and any addenda from your phone — no printer required."
          />
          <ActionCard
            Icon={KeyRound}
            title="Apply for a home"
            body="Found one of our listings? Apply online with verified income and ID in minutes."
          />
          <ActionCard
            Icon={MessageSquare}
            title="Message us"
            body="Everything in writing, in one thread — questions, notices, and updates about your home."
          />
          <ActionCard
            Icon={ShieldCheck}
            title="Documents on file"
            body="Your lease, disclosures, inspection reports, and receipts — always a click away."
          />
        </div>
      </section>

      {/* ── Contact ───────────────────────────────────────────────────── */}
      <section className="bg-brand-gradient">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 py-14 text-center">
          <h2 className="text-2xl lg:text-3xl font-bold text-white">Questions about your home or lease?</h2>
          <p className="mt-3 text-white/80">
            Reach us any time at{' '}
            <a href={`mailto:${BRAND.supportEmail}`} className="underline decoration-white/40 hover:decoration-white">
              {BRAND.supportEmail}
            </a>{' '}
            or send a message from your resident portal.
          </p>
        </div>
      </section>
    </>
  )
}

function ActionCard({ Icon, title, body }: { Icon: typeof CreditCard; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
        <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
      </div>
      <h3 className="mt-4 font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-mute leading-relaxed">{body}</p>
    </div>
  )
}
