import { Link } from 'react-router-dom'
import { Check, ArrowRight, Sparkles } from 'lucide-react'
import { useRouteSeo } from '../../lib/useSeo'
import { BRAND } from '../../lib/brand'

// Free for landlords (2026-10-20). Screening prices live in
// shared/lib/screeningPricing.ts; payment fees in shared/lib/paymentFees.ts.
import { TENABILITY_PRICE, TENABILITY_PRO_PRICE } from '@findstoop/shared/lib/screeningPricing'

const included = [
  'Unlimited properties and units',
  'Listings and online applications',
  'Tenability™ screening — the applicant pays, not you',
  'State-specific lease templates with e-sign for every roommate',
  'Online rent collection, autopay, and automatic late fees',
  'Lease renewals in a few clicks',
  'Maintenance requests with photos',
  'Tenant portal on any phone',
  'Income & expense tracking with CSV export',
  'In-app messaging per lease',
]

const renterCosts = [
  { label: 'Bank transfer (ACH) rent payment', price: '0.8%', sub: 'capped at $5 per payment, however large the rent' },
  { label: 'Card rent payment',                price: '3%',   sub: 'paid by the renter at checkout' },
  { label: 'Tenability™',                      price: `$${TENABILITY_PRICE}`,     sub: 'income verification + ID verification + 0–100 Tenability™ score' },
  { label: 'Tenability™ Pro',                  price: `$${TENABILITY_PRO_PRICE}`, sub: 'everything in Tenability™ + selfie ID match + applicant-provided credit + authenticity scoring' },
]

export default function Pricing() {
  useRouteSeo('/pricing')
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50/60 to-white">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 pt-20 pb-10">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-ink tracking-tight">
                Free for landlords.
              </h1>
              <p className="mt-5 text-lg text-mute max-w-xl">
                Every feature, every unit, no subscription and no card on file. Applicants pay for
                their own screening, and whoever pays rent pays the processing — at cost.
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

      {/* The plan */}
      <section className="py-8">
        <div className="max-w-4xl mx-auto px-5 lg:px-8">
          <article className="bg-white rounded-2xl border-2 border-brand-200 p-8 relative">
            <div className="absolute -top-3 left-8 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-brand-500 px-3 py-1 rounded-full">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
              Everything included
            </div>

            <div className="grid md:grid-cols-2 gap-10 mt-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-mute font-semibold">{BRAND.name} for landlords</p>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-5xl font-bold text-ink">$0</span>
                  <span className="text-mute">/ month, any number of units</span>
                </div>
                <Link
                  to="/register"
                  className="mt-6 inline-flex items-center justify-center gap-2 w-full bg-brand-500 hover:bg-brand-600 text-white font-medium px-5 py-3 rounded-lg transition-colors"
                >
                  Get started
                  <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </Link>
                <p className="mt-3 text-xs text-mute text-center">
                  No credit card. Nothing to cancel.
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-mute font-semibold mb-3">Included</p>
                <ul className="space-y-2.5">
                  {included.map((line) => (
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

      {/* What renters pay */}
      <section className="py-16 bg-gradient-to-b from-white to-brand-50/40">
        <div className="max-w-4xl mx-auto px-5 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-ink tracking-tight">
              What renters and applicants pay
            </h2>
            <p className="mt-3 text-mute max-w-xl mx-auto">
              Processing is passed through at cost — renters see both totals in dollars and pick the
              cheaper one before paying. Screening is a one-time fee per application.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
            {renterCosts.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 px-6 py-4">
                <div>
                  <p className="font-medium text-ink">{row.label}</p>
                  <p className="text-xs text-mute mt-0.5">{row.sub}</p>
                </div>
                <p className="text-lg font-semibold text-ink shrink-0">{row.price}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-mute text-center max-w-xl mx-auto">
            Some states limit application fees. Where they do, we charge less or don’t offer applicant-paid
            screening at all — your property page shows what applies in your state.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-5 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-ink tracking-tight mb-8">
            Pricing questions
          </h2>
          <div className="space-y-6">
            <Faq q="Is it really free?">
              Yes. Every feature, for any number of units, with no subscription and no card on file.
            </Faq>
            <Faq q={`So how does ${BRAND.name} make money?`}>
              Applicants pay ${TENABILITY_PRICE} for Tenability™ (or ${TENABILITY_PRO_PRICE} for Pro) when they apply to
              your listing. That's the business model — we don't sell your data, and rent processing isn't a profit center.
            </Faq>
            <Faq q="What do my tenants pay to pay rent?">
              Only the processing cost: 0.8% on a bank transfer, never more than $5, or 3% on a card. They see both
              totals in dollars and choose. You can cover the fee for a particular tenant if you like.
            </Faq>
            <Faq q="Is there a catch?">
              No contract, no tier ladder, no “upgrade to unlock.” If we ever introduce a paid plan, everything
              you're using now stays free.
            </Faq>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-brand-500 to-brand-600 text-white">
        <div className="max-w-3xl mx-auto px-5 lg:px-8 py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Free for landlords. Bring your portfolio.
          </h2>
          <p className="mt-3 text-white/85">
            CSV import included.
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
