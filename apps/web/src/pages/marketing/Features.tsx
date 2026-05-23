import { Link } from 'react-router-dom'
import {
  Megaphone, ClipboardList, ShieldCheck, FileSignature, CreditCard, Wrench,
  MessageSquare, Folder, BarChart3, ArrowRight, type LucideIcon,
} from 'lucide-react'
import { useSeo } from '../../lib/useSeo'

interface Feature {
  Icon: LucideIcon
  title: string
  body: string
  bullets: string[]
}

const features: Feature[] = [
  {
    Icon: Megaphone,
    title: 'Listings that go where renters look',
    body: 'Publish a single listing and it shows up across the rental sites prospective tenants actually visit. Update the asking rent or photos in one place, everywhere.',
    bullets: ['Syndication to top rental marketplaces', 'Branded listing page with your own URL', 'Track views and inquiries per unit'],
  },
  {
    Icon: ClipboardList,
    title: 'One standardized application',
    body: 'Every applicant fills out the same form, so you can actually compare candidates side by side instead of squinting at a dozen email attachments.',
    bullets: ['Income, employment, and rental history captured', 'Co-applicant and roommate flows', 'Side-by-side comparison view'],
  },
  {
    Icon: ShieldCheck,
    title: 'Screening that applicants pay for',
    body: 'Credit, background, and eviction reports come back in minutes. The applicant pays, so you can evaluate as many candidates as you want at no cost.',
    bullets: ['TransUnion credit + background', 'Nationwide eviction history', 'Portable: applicants can reuse with other landlords'],
  },
  {
    Icon: FileSignature,
    title: 'E-sign leases on any device',
    body: 'Pick a state-specific template, fill in the unit and rent, and send. Both parties sign on phone or laptop. We keep an audit trail with timestamps and IP.',
    bullets: ['50-state lease templates that update with the law', 'Mobile-friendly signing experience', 'Immutable audit log per signature'],
  },
  {
    Icon: CreditCard,
    title: 'Rent collection that runs itself',
    body: 'Tenants pay by ACH (free) or card. Reminders go out automatically. Late fees apply on schedule. You get a receipt, they get a receipt, the books balance themselves.',
    bullets: ['Auto-reminders 3 days before due date', 'Late-fee rules you configure once', 'Recurring rent + one-off charges'],
  },
  {
    Icon: Wrench,
    title: 'Maintenance, triaged',
    body: 'Tenants submit requests with photos and priority. You assign to a vendor, track cost against the property, and resolve — all without leaving FindStoop.',
    bullets: ['Photo upload from tenant phones', 'Vendor assignment and cost tracking', 'Priority routing (emergency, high, medium, low)'],
  },
  {
    Icon: MessageSquare,
    title: 'Built-in messaging',
    body: 'A real conversation thread per tenant, scoped to their active lease. No more digging through email to find the last thing they asked.',
    bullets: ['Per-lease conversation history', 'Unread badges across devices', 'Optional broadcast to all current tenants'],
  },
  {
    Icon: Folder,
    title: 'Documents in one place',
    body: 'Leases, addendums, inspections, notices — categorized, searchable, accessible to the right people only.',
    bullets: ['Per-lease document binders', 'Tenant access to their own files', 'Encrypted storage with signed URLs'],
  },
  {
    Icon: BarChart3,
    title: 'Reports that make tax season tolerable',
    body: 'Rent collected, expenses logged, occupancy, late-pay rate. Export to CSV when your accountant asks.',
    bullets: ['Income and expense by property', 'Schedule E–friendly exports', 'Occupancy and collection-rate trend lines'],
  },
]

export default function Features() {
  useSeo({
    title: 'Features',
    description: 'Listings, standardized applications, applicant-pays screening, e-sign leases, online rent, maintenance tracking, messaging, documents, and reporting — every tool a small landlord actually uses.',
    path: '/features',
  })
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50/60 to-white">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 pt-20 pb-12">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-ink tracking-tight">
                Every tool a small landlord actually uses.
              </h1>
              <p className="mt-5 text-lg text-mute max-w-xl">
                FindStoop bundles the workflow you've been duct-taping together.
                Every feature is on at one flat price — $9 per active unit per month. No tier ladder.
              </p>
            </div>
            <div>
              <img
                src="/illustrations/features.png"
                alt=""
                className="w-full max-w-md mx-auto h-auto"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink text-white">
        <div className="max-w-4xl mx-auto px-5 lg:px-8 py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            See it in action — it's free.
          </h2>
          <p className="mt-3 text-white/70">
            Add your first property in about three minutes.
          </p>
          <Link
            to="/register"
            className="mt-6 inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-medium px-6 py-3 rounded-lg transition-colors"
          >
            Get started
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </Link>
        </div>
      </section>
    </>
  )
}

function FeatureCard({ Icon, title, body, bullets }: Feature) {
  return (
    <article className="bg-white rounded-2xl border border-gray-100 p-6 hover:border-brand-200 hover:shadow-md transition-all">
      <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
      </div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-mute leading-relaxed">{body}</p>
      <ul className="mt-4 space-y-1.5 text-xs text-ink/80">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-1.5">
            <span className="text-brand-600 mt-0.5">•</span>
            {b}
          </li>
        ))}
      </ul>
    </article>
  )
}
