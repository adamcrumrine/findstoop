import { Link } from 'react-router-dom'
import {
  Building2, Megaphone, ShieldCheck, FileSignature, CreditCard,
  ArrowRight, type LucideIcon,
} from 'lucide-react'
import { useSeo } from '../../lib/useSeo'

interface Step {
  number: string
  Icon: LucideIcon
  title: string
  body: string
  detail: string[]
}

const steps: Step[] = [
  {
    number: '01',
    Icon: Building2,
    title: 'Set up your account and add a property',
    body: 'Sign up free. Add an address, a unit, the rent amount. We pre-fill what we can — county, market rent estimates, average days-on-market for your zip — so the boring part takes a minute.',
    detail: [
      'No credit card to sign up',
      'Bulk import CSV if you have an existing portfolio',
      'Invite your current tenants — they keep their lease history',
    ],
  },
  {
    number: '02',
    Icon: Megaphone,
    title: 'List vacant units and share a branded apply link',
    body: 'Add unit photos, amenities, and description once. You get a clean shareable apply link to drop into a Facebook Marketplace post, your own site, or a Craigslist listing. One-click syndication to the big rental marketplaces is on the roadmap.',
    detail: [
      'Branded listing + apply page with a shareable URL',
      'Per-unit application funnel — every applicant comes through one channel',
      'Marketplace syndication coming soon',
    ],
  },
  {
    number: '03',
    Icon: ShieldCheck,
    title: 'Get verified applicants — for $5, in minutes',
    body: 'Every applicant fills out one standardized form, then completes a $5 verified pre-qualification: paystubs, driver\'s license, and an AI-generated Tenability™ the manager sees alongside the income-to-rent ratio. No employer phone calls, no 3–7 day Truework waits. Full credit + criminal + eviction reports coming as an opt-in add-on.',
    detail: [
      'Verified income via paystub OCR (or 1099 / bank statement / tax return)',
      'Verified ID via driver\'s license OCR + optional selfie match',
      'AI Tenability™ 0–100, Fair-Housing-safe, no protected-class signals',
    ],
  },
  {
    number: '04',
    Icon: FileSignature,
    title: 'Sign the lease — electronically, in minutes',
    body: 'Pick a state-specific template, fill in the unit and rent, send. Both parties sign on any device. We keep an immutable audit log per signature so the document holds up later.',
    detail: [
      '50-state attorney-reviewed templates',
      'Timestamps + IP per signature, ESIGN-compliant',
      'Tenant gets a copy; you can re-download anytime',
    ],
  },
  {
    number: '05',
    Icon: CreditCard,
    title: 'Collect rent and run the place',
    body: 'Auto-reminders three days before rent is due. ACH is free. Late fees apply themselves. Maintenance requests come in with photos. You watch the dashboard from the couch.',
    detail: [
      'Auto-reminders + auto late fees',
      'Photo-attached maintenance triage',
      'Income, expense, and Schedule E exports come tax time',
    ],
  },
]

export default function HowItWorks() {
  useSeo({
    title: 'How it works',
    description: 'Set up an account, list a vacancy, screen applicants, e-sign the lease, and start collecting rent — the five steps from sign-up to first paycheck on FindStoop.',
    path: '/how-it-works',
  })
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50/60 to-white">
        <div className="max-w-3xl mx-auto px-5 lg:px-8 pt-20 pb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-ink tracking-tight">
            From keys-in-hand to rent-in-account, in five steps.
          </h1>
          <p className="mt-5 text-lg text-mute">
            We collapsed the small-landlord workflow into one place. Here's the
            shape of it.
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-5 lg:px-8">
          <ol className="space-y-10 md:space-y-14">
            {steps.map((s, i) => (
              <li key={s.number} className="grid md:grid-cols-[120px_1fr] gap-6 md:gap-10">
                <div className="flex md:flex-col items-center md:items-start gap-4">
                  <span className="text-4xl md:text-5xl font-bold text-brand-200 leading-none">{s.number}</span>
                  <div className="hidden md:block w-px flex-1 bg-gradient-to-b from-brand-200 to-transparent ml-3" />
                </div>
                <article className="bg-white rounded-2xl border border-gray-100 p-7">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                      <s.Icon className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-ink tracking-tight">{s.title}</h2>
                  </div>
                  <p className="text-mute leading-relaxed">{s.body}</p>
                  <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-ink/80">
                    {s.detail.map((d) => (
                      <li key={d} className="flex items-start gap-2">
                        <span className="text-brand-600 mt-0.5">•</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </article>
                {i === steps.length - 1 && <div />}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-brand-500 to-brand-600 text-white mt-8">
        <div className="max-w-3xl mx-auto px-5 lg:px-8 py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Walk through it yourself.
          </h2>
          <p className="mt-3 text-white/85">
            Sign up free and add a property. About three minutes from here.
          </p>
          <Link
            to="/register"
            className="mt-6 inline-flex items-center gap-2 bg-white text-brand-700 hover:bg-brand-50 font-medium px-6 py-3 rounded-lg transition-colors"
          >
            Get started
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </Link>
        </div>
      </section>
    </>
  )
}
