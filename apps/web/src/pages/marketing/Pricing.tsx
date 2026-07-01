import { Link } from 'react-router-dom'
import { Check, ArrowRight, Sparkles } from 'lucide-react'
import { useSeo } from '../../lib/useSeo'
import { BRAND } from '../../lib/brand'

// Single-tier pricing: $9/unit/mo, $90/unit/yr.
const PER_UNIT_MONTHLY = 9
const PER_UNIT_ANNUAL  = 90 // effective $7.50/mo, 16.7% discount, non-refundable

const includedAtThisPrice = [
  'Unlimited properties and units',
  'Verified pre-qualification on every applicant (applicant pays $5)',
  'AI Tenability™ with Fair-Housing-safe scoring',
  'Online rent collection — ACH free for your tenants',
  '50-state lease templates with e-sign',
  'Maintenance tracking with photos',
  '24/7 tenant portal access',
  'Income & expense tracking with CSV export',
  'In-app messaging per lease',
  'Priority human support',
]

const tenantCosts = [
  { label: 'ACH rent payment',  price: 'Free', sub: 'covered by the landlord' },
  { label: 'Card rent payment', price: '3.5%', sub: 'paid by the renter at checkout' },
  { label: 'Tenability™',       price: '$5',   sub: 'income verification + ID verification + AI Tenability™ score' },
  { label: 'Tenability™ Pro',   price: '$25',  sub: 'everything in Tenability™ + selfie ID match + applicant-provided credit + authenticity scoring' },
]

const billingExamples = [
  { units: 1,  monthly: 9,    annual: 90 },
  { units: 3,  monthly: 27,   annual: 270 },
  { units: 5,  monthly: 45,   annual: 450 },
  { units: 10, monthly: 90,   annual: 900 },
  { units: 25, monthly: 225,  annual: 2250 },
  { units: 50, monthly: 450,  annual: 4500 },
]

export default function Pricing() {
  useSeo({
    title: 'Pricing — $9 per unit per month',
    description: 'Simple per-unit pricing — $9 per unit per month, $90 per unit per year. Every feature included. Applicants pay $5 for verified pre-qualification. No setup fees, no upsells.',
    path: '/pricing',
  })
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50/60 to-white">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 pt-20 pb-10">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-ink tracking-tight">
                One plan, ${PER_UNIT_MONTHLY} per unit per month.
              </h1>
              <p className="mt-5 text-lg text-mute max-w-xl">
                Every feature, every integration, every state's lease templates —
                included. Your tenants pay zero on ACH rent transfers.
                Pay monthly or save 16.7% with annual prepay.
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

      {/* Single plan card */}
      <section className="py-8">
        <div className="max-w-4xl mx-auto px-5 lg:px-8">
          <article className="bg-white rounded-2xl border-2 border-brand-200 p-8 relative">
            <div className="absolute -top-3 left-8 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-brand-500 px-3 py-1 rounded-full">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
              Everything included
            </div>

            <div className="grid md:grid-cols-2 gap-10 mt-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-mute font-semibold">{BRAND.name}</p>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-5xl font-bold text-ink">${PER_UNIT_MONTHLY}</span>
                  <span className="text-mute">/ unit / month</span>
                </div>
                <p className="text-sm text-mute mt-2">
                  Or <strong className="text-ink">${PER_UNIT_ANNUAL}/unit/year</strong> with
                  annual prepay (effective ${(PER_UNIT_ANNUAL / 12).toFixed(2)}/mo —
                  16.7% off; non-refundable).
                </p>
                <Link
                  to="/register"
                  className="mt-6 inline-flex items-center justify-center gap-2 w-full bg-brand-500 hover:bg-brand-600 text-white font-medium px-5 py-3 rounded-lg transition-colors"
                >
                  Get started
                  <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </Link>
                <p className="mt-3 text-xs text-mute text-center">
                  No credit card required to sign up. You're only charged once your first lease goes active.
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-mute font-semibold mb-3">Included at this price</p>
                <ul className="space-y-2.5">
                  {includedAtThisPrice.map((line) => (
                    <li key={line} className="flex items-start gap-2.5 text-sm text-ink">
                      <Check className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" strokeWidth={2.5} />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
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
              Linear pricing. Pay only for active units — vacant units never count.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-3 px-6 py-3 bg-gray-50 text-xs uppercase tracking-wider text-mute font-semibold">
              <div>Active units</div>
              <div className="text-center">Monthly</div>
              <div className="text-right">Annual prepay</div>
            </div>
            {billingExamples.map((row) => (
              <div key={row.units} className="grid grid-cols-3 px-6 py-4 border-t border-gray-100 text-sm">
                <div className="text-ink">{row.units} unit{row.units === 1 ? '' : 's'}</div>
                <div className="text-center font-semibold text-ink">${row.monthly}</div>
                <div className="text-right text-ink">
                  ${row.annual.toLocaleString()}
                  <span className="text-xs text-mute ml-1">/yr</span>
                </div>
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
              ACH bank transfers are free for your tenants — we cover the fee.
              Card payments include a 3.5% processing surcharge, paid by the renter.
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
            <Faq q="When do I start paying?">
              You can sign up, add properties, and invite tenants without paying anything.
              Billing only starts once your first lease goes active — that's when the unit
              counts as a "paid unit" at ${PER_UNIT_MONTHLY}/month.
            </Faq>
            <Faq q="What counts as a unit?">
              Anything you'd rent to a separate household. A single-family home is one
              unit. A duplex is two. Vacant units don't count — we only charge for active
              leases.
            </Faq>
            <Faq q="Can I cancel?">
              Yes, in one click. Monthly subscriptions stop at the end of the current
              billing period; you keep access until then. Annual prepay isn't refundable,
              but access continues through the end of your prepaid term.
            </Faq>
            <Faq q="What about portfolios over 50 units?">
              The standard plan covers up to 50 units. If you're managing more, you've
              outgrown the DIY category — reach out and we'll talk about volume pricing.
            </Faq>
            <Faq q="Why isn't there a free tier?">
              We could offer one, but every other landlord platform with a free tier
              monetizes by charging your tenants — surcharges, screening reports, optional
              "speed-up" fees. We'd rather charge a flat, honest ${PER_UNIT_MONTHLY}/unit/mo
              and keep the experience clean for your renters.
            </Faq>
            <Faq q="Annual prepay — what's the catch?">
              No catch other than the non-refundable bit: prepaying ${PER_UNIT_ANNUAL}/unit
              for the year saves you 16.7% over monthly. If you cancel mid-year, you keep
              access through the end of the prepaid term — but no refund. Units you remove
              mid-year don't generate a credit.
            </Faq>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-brand-500 to-brand-600 text-white">
        <div className="max-w-3xl mx-auto px-5 lg:px-8 py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Sign up free. Bring your portfolio.
          </h2>
          <p className="mt-3 text-white/85">
            You're not billed until your first lease goes active. CSV import included.
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
