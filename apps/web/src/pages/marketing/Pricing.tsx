import { Link } from 'react-router-dom'
import { Check, ArrowRight, Sparkles } from 'lucide-react'

const FREE_UNITS = 2
const PER_UNIT_MONTHLY = 3
const PER_UNIT_ANNUAL = 30 // $30/unit/year — effective $2.50/mo. Non-refundable.

const includedAtEveryTier = [
  'Unlimited properties (units priced separately)',
  'Online rent collection (ACH free, card 3.5%)',
  '50-state lease templates with e-sign',
  'Tenant screening review and decisions',
  'Maintenance tracking with photos',
  'Tenant messaging and document storage',
  'Income and expense reports',
  'Export everything to CSV',
]

const tenantCosts = [
  { label: 'Credit + background + eviction', price: '$55', sub: 'paid once per applicant' },
  { label: 'ACH rent payment', price: 'Free', sub: 'no fee to the renter' },
  { label: 'Card rent payment', price: '3.5%', sub: 'paid by whoever the landlord designates' },
]

const billingExamples = [
  { units: 1, cost: '$0' },
  { units: 2, cost: '$0' },
  { units: 5, cost: '$9' },   // 3 paid units × $3
  { units: 10, cost: '$24' }, // 8 paid units × $3
  { units: 25, cost: '$69' }, // 23 paid units × $3
  { units: 50, cost: '$144' },// 48 paid units × $3
]

export default function Pricing() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50/60 to-white">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 pt-20 pb-10">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-ink tracking-tight">
                Your first two units are on us.
              </h1>
              <p className="mt-5 text-lg text-mute max-w-xl">
                Run one duplex for free, forever. Past that, it's a flat ${PER_UNIT_MONTHLY} per
                unit per month — no surprise fees, no per-feature gates.
              </p>
            </div>
            <div>
              <img
                src="/illustrations/pricing.png"
                alt=""
                className="w-full max-w-md mx-auto h-auto"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-5 lg:px-8 grid md:grid-cols-2 gap-6">
          {/* Starter */}
          <article className="bg-white rounded-2xl border-2 border-brand-200 p-7 relative">
            <div className="absolute -top-3 left-6 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-brand-500 px-3 py-1 rounded-full">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
              Free, forever
            </div>
            <p className="text-xs uppercase tracking-wider text-mute font-semibold">Starter</p>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-5xl font-bold text-ink">$0</span>
              <span className="text-mute">/mo</span>
            </div>
            <p className="text-sm text-mute mt-2">
              Up to {FREE_UNITS} active units. Everything in the platform — no trial limits, no upsells.
            </p>
            <Link
              to="/register"
              className="mt-6 inline-flex items-center justify-center gap-2 w-full bg-brand-500 hover:bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              Start free
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
            <ul className="mt-7 space-y-2.5">
              {includedAtEveryTier.map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-sm text-ink">
                  <Check className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" strokeWidth={2.5} />
                  {line}
                </li>
              ))}
            </ul>
          </article>

          {/* Growth */}
          <article className="bg-ink text-white rounded-2xl p-7">
            <p className="text-xs uppercase tracking-wider text-white/60 font-semibold">Growth</p>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-5xl font-bold">${PER_UNIT_MONTHLY}</span>
              <span className="text-white/60">/ unit / mo</span>
            </div>
            <p className="text-sm text-white/70 mt-2">
              Past your first {FREE_UNITS} units. Up to 50 units. Cancel any time — drop back to Starter without losing your data.
            </p>
            <Link
              to="/register"
              className="mt-6 inline-flex items-center justify-center gap-2 w-full bg-white text-ink hover:bg-white/90 font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              Try Growth — first month free
            </Link>
            <p className="mt-7 text-xs uppercase tracking-wider text-white/50 font-semibold mb-3">
              Everything in Starter, plus
            </p>
            <ul className="space-y-2.5">
              <li className="flex items-start gap-2.5 text-sm">
                <Check className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" strokeWidth={2.5} />
                <span>
                  Annual prepay option: ${PER_UNIT_ANNUAL}/unit/year (effectively ${(PER_UNIT_ANNUAL / 12).toFixed(2)}/mo).
                  <span className="block text-white/50 text-xs mt-0.5">Non-refundable.</span>
                </span>
              </li>
              <li className="flex items-start gap-2.5 text-sm">
                <Check className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" strokeWidth={2.5} />
                Next-day rent deposit (vs. 3-day default)
              </li>
              <li className="flex items-start gap-2.5 text-sm">
                <Check className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" strokeWidth={2.5} />
                Bulk operations and CSV import
              </li>
              <li className="flex items-start gap-2.5 text-sm">
                <Check className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" strokeWidth={2.5} />
                Priority human support
              </li>
            </ul>
          </article>
        </div>
      </section>

      {/* Billing examples */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-5 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-ink tracking-tight">
              What you'll actually pay
            </h2>
            <p className="mt-3 text-mute max-w-xl mx-auto">
              Pricing is linear. The first {FREE_UNITS} units never count toward your bill.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-3 px-6 py-3 bg-gray-50 text-xs uppercase tracking-wider text-mute font-semibold">
              <div>Portfolio size</div>
              <div className="text-center">Paid units</div>
              <div className="text-right">Monthly bill</div>
            </div>
            {billingExamples.map((row) => (
              <div key={row.units} className="grid grid-cols-3 px-6 py-4 border-t border-gray-100 text-sm">
                <div className="text-ink">{row.units} units</div>
                <div className="text-center text-mute">{Math.max(0, row.units - FREE_UNITS)}</div>
                <div className="text-right font-semibold text-ink">{row.cost}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What renters pay */}
      <section className="py-16 bg-gradient-to-b from-white to-brand-50/40">
        <div className="max-w-4xl mx-auto px-5 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-ink tracking-tight">
              What renters pay
            </h2>
            <p className="mt-3 text-mute max-w-xl mx-auto">
              Renters cover their own screening reports. Rent payments are free over ACH.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
            {tenantCosts.map((row) => (
              <div key={row.label} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="font-medium text-ink">{row.label}</p>
                  <p className="text-xs text-mute mt-0.5">{row.sub}</p>
                </div>
                <p className="text-lg font-semibold text-ink">{row.price}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-5 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-ink tracking-tight mb-8">
            Pricing questions
          </h2>
          <div className="space-y-6">
            <Faq q="What's actually free?">
              Your first {FREE_UNITS} active units are free for as long as you have them — full
              platform access, every feature. Past that, you pay ${PER_UNIT_MONTHLY} per unit per
              month for units 3 through 50.
            </Faq>
            <Faq q="What counts as a unit?">
              Anything you'd rent to a separate household. A single-family home is one unit. A
              duplex is two. Vacancies don't count toward your billed units; we only charge for
              units that currently have an active lease.
            </Faq>
            <Faq q="What about portfolios over 50 units?">
              Growth tops out at 50 units. If you're managing more, you've outgrown the DIY
              category — reach out and we'll talk about volume pricing.
            </Faq>
            <Faq q="Who pays card processing fees?">
              That's up to you. Most landlords absorb ACH (since it's free) and ask tenants to
              cover the card surcharge if they prefer that route.
            </Faq>
            <Faq q="Can I cancel?">
              Yes, in one click. You drop back to Starter, keep your first {FREE_UNITS} units
              live, and archive the rest without losing the data. Monthly subscriptions
              stop at the end of the current billing period; you are not charged again.
            </Faq>
            <Faq q="What about the annual prepay option?">
              Annual prepay locks in ${PER_UNIT_ANNUAL} per unit for the year (effectively
              ${(PER_UNIT_ANNUAL / 12).toFixed(2)}/mo — a 16.7% discount over monthly).
              <strong> Annual prepayments are non-refundable.</strong> If you cancel mid-year,
              you keep paid access through the end of your prepaid term and won't be billed again.
              Removing units mid-year does not generate a refund or credit; new units added
              after prepay are billed at the standard monthly rate until your next annual renewal.
            </Faq>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-brand-500 to-brand-600 text-white">
        <div className="max-w-3xl mx-auto px-5 lg:px-8 py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Try Starter free. Bring your data.
          </h2>
          <p className="mt-3 text-white/85">
            Set up takes about three minutes. CSV import included.
          </p>
          <Link
            to="/register"
            className="mt-6 inline-flex items-center gap-2 bg-white text-brand-700 hover:bg-brand-50 font-medium px-6 py-3 rounded-lg transition-colors"
          >
            Create my landlord account
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </Link>
        </div>
      </section>
    </>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 pb-6 last:border-none">
      <p className="font-semibold text-ink">{q}</p>
      <p className="mt-2 text-mute leading-relaxed">{children}</p>
    </div>
  )
}
