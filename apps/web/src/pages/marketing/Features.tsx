import { Link } from 'react-router-dom'
import {
  ClipboardList, ShieldCheck, Sparkles, FileSignature, CreditCard, Wrench,
  MessageSquare, Folder, BarChart3, ArrowRight, IdCard, type LucideIcon,
} from 'lucide-react'
import { useSeo } from '../../lib/useSeo'

type Status = 'live' | 'beta' | 'soon'

interface Feature {
  Icon: LucideIcon
  title: string
  body: string
  bullets: string[]
  status: Status
}

const features: Feature[] = [
  {
    Icon: Sparkles,
    status: 'live',
    title: 'Tenability™ — the 0–100 score every applicant arrives with',
    body: 'For $5, every applicant gets a Tenability™ — our private rentability score the manager sees alongside the income-to-rent ratio. Built on a proprietary AI signal pipeline configured to ignore protected-class signals under the Fair Housing Act.',
    bullets: ['Single 0–100 score with a plain-English summary', 'Income-to-rent ratio computed from verified docs', 'Document anomaly flags surfaced automatically'],
  },
  {
    Icon: ClipboardList,
    status: 'live',
    title: 'Verified income — without the Truework wait',
    body: 'Applicants upload income documents and our AI verifies them in seconds. No employer phone calls, no 3–7 day Truework waits. Supports five income paths so gig workers, retirees, and new hires aren\'t shut out.',
    bullets: ['Seconds, not days, to verify', 'Five income paths covered', 'Last-4 SSN only — never full SSN'],
  },
  {
    Icon: IdCard,
    status: 'live',
    title: 'Identity verification — included',
    body: 'Driver\'s license verification on every applicant, with an optional selfie ID match (+$2 — included free with the applicant-provided credit tier). Cross-checks against the application catch identity fraud cleanly.',
    bullets: ['DL verification on every applicant', 'Optional selfie face match for a tighter lock', 'Suspicious-document flags surfaced to the landlord'],
  },
  {
    Icon: CreditCard,
    status: 'live',
    title: 'Applicant-provided credit history',
    body: 'For +$20, applicants upload their free AnnualCreditReport.gov PDF with a signed attestation. Our AI runs an authenticity check against their other documents and surfaces a confidence score to the landlord. Selfie ID match included free.',
    bullets: ['Applicant uploads their own federally-free report', 'AI authenticity score 0–100 vs. other docs', 'Selfie ID match bundled at no extra cost'],
  },
  {
    Icon: ShieldCheck,
    status: 'soon',
    title: 'Full bureau-pulled reports — credit, criminal, eviction',
    body: 'Bureau-pulled credit, criminal background, and eviction history as opt-in add-ons the manager configures per property. Coming as soon as our consumer-reporting-agency partnerships finalize.',
    bullets: ['Bureau-issued credit + score', 'National criminal + watchlist', 'Eviction court records nationwide'],
  },
  {
    Icon: FileSignature,
    status: 'live',
    title: 'E-sign leases on any device',
    body: 'Pick a state-specific template, fill in the unit and rent, and send. Both parties sign on phone or laptop. We keep an audit trail with timestamps and IP.',
    bullets: ['50-state lease templates with state-specific clauses', 'Mobile-friendly signing experience', 'Immutable audit log per signature'],
  },
  {
    Icon: CreditCard,
    status: 'live',
    title: 'Rent collection that runs itself',
    body: 'Tenants pay by ACH (free) or card. Reminders go out automatically. Late fees apply on schedule. Stripe Connect routes funds direct to the landlord\'s bank — we never touch the money.',
    bullets: ['Auto-reminders before due date', 'Late-fee rules you configure once', 'Stripe Connect — funds straight to your bank'],
  },
  {
    Icon: Wrench,
    status: 'live',
    title: 'Maintenance, triaged',
    body: 'Tenants submit requests with photos and priority. You triage in the dashboard and resolve — all without leaving FindStoop.',
    bullets: ['Photo upload from tenant phones', 'Priority routing (emergency, high, medium, low)', 'Status updates visible to the tenant'],
  },
  {
    Icon: MessageSquare,
    status: 'live',
    title: 'Built-in messaging',
    body: 'A real conversation thread per tenant, scoped to their active lease. No more digging through email to find the last thing they asked.',
    bullets: ['Per-lease conversation history', 'Unread badges across devices', 'Searchable, with timestamps'],
  },
  {
    Icon: Folder,
    status: 'live',
    title: 'Documents in one place',
    body: 'Leases, addendums, inspections, notices — categorized, searchable, accessible to the right people only.',
    bullets: ['Per-lease document binders', 'Tenant access to their own files', 'Encrypted storage with signed URLs'],
  },
  {
    Icon: BarChart3,
    status: 'beta',
    title: 'Reports that make tax season tolerable',
    body: 'Rent collected, expenses logged, occupancy, late-pay rate. Export to CSV when your accountant asks.',
    bullets: ['Income and expense by property', 'Schedule E–friendly exports', 'Occupancy and collection-rate trends'],
  },
]

const STATUS_CFG: Record<Status, { label: string; cls: string }> = {
  live: { label: 'Live', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  beta: { label: 'Beta', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  soon: { label: 'Coming soon', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
}

export default function Features() {
  useSeo({
    title: 'Features',
    description: 'Verified pre-qualification with AI Tenability™ scoring, e-sign leases, online rent collection, maintenance tracking, in-app messaging, and Schedule-E-friendly reports — every tool a small landlord actually uses.',
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
                FindStoop bundles the workflow you've been duct-taping together —
                with a verified-pre-qualification product no one else in the small-landlord
                space offers at $5. Every feature is on at one flat price for the landlord —
                $9 per active unit per month. No tier ladder.
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

function FeatureCard({ Icon, title, body, bullets, status }: Feature) {
  const badge = STATUS_CFG[status]
  return (
    <article className="bg-white rounded-2xl border border-gray-100 p-6 hover:border-brand-200 hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center">
          <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge.cls}`}>
          {badge.label}
        </span>
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
