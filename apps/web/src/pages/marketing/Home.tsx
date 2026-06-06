import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CreditCard, FileSignature, Wrench, ShieldCheck, MessageSquare,
  ArrowRight, Check, Sparkles, BarChart3, ClipboardList,
  type LucideIcon,
} from 'lucide-react'
import Illustration from '../../components/marketing/Illustration'
import { useSeo } from '../../lib/useSeo'

type Status = 'live' | 'beta' | 'soon'

export default function Home() {
  useSeo({
    title: 'Property management for landlords with a handful of units',
    description: 'List vacancies, screen applicants, sign leases, and accept rent online — built for landlords who own a handful of properties, not a hundred. $9 per unit per month.',
    path: '/',
  })
  const [email, setEmail] = useState('')
  const navigate = useNavigate()

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return navigate('/register')
    navigate(`/register?email=${encodeURIComponent(trimmed)}`)
  }

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-brand-50">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(0,168,150,0.10),transparent_60%)]" />
        <div className="relative max-w-6xl mx-auto px-5 lg:px-8 pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-100 px-3 py-1.5 rounded-full mb-5">
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
                $9 per unit per month. Every feature included.
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-ink leading-[1.05] tracking-tight">
                Run your rentals like a pro — without <span className="text-brand-500">becoming one.</span>
              </h1>
              <p className="mt-5 text-lg text-mute max-w-xl">
                Every applicant arrives pre-qualified with a Tenability™ score (from $5)
                — verified income, verified ID, and an AI rentability number in minutes. Plus
                listings, e-sign leases, and online rent in one place.
              </p>

              {/* Email signup */}
              <form onSubmit={handleSignup} className="mt-8 flex flex-col sm:flex-row gap-3 max-w-md">
                <label htmlFor="home-signup-email" className="sr-only">Email address</label>
                <input
                  id="home-signup-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 px-4 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-5 py-3 rounded-lg transition-colors"
                >
                  Get started
                  <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </button>
              </form>
              <p className="mt-3 text-sm text-mute">
                Already a member? <Link to="/login" className="text-brand-600 font-medium hover:underline">Sign in here</Link>.
              </p>
            </div>

            {/* Hero visual — Houses illustration */}
            <div className="relative">
              <img
                src="/illustrations/hero.png"
                alt=""
                className="w-full max-w-lg mx-auto h-auto"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust strip ───────────────────────────────────────────────── */}
      <section className="border-y border-gray-100 py-8 bg-white">
        <div className="max-w-6xl mx-auto px-5 lg:px-8">
          <p className="text-center text-xs uppercase tracking-wider text-mute font-semibold mb-5">
            Built for the 73% of US rental properties owned by individuals, not institutions
            <span className="block mt-1 text-[10px] tracking-normal normal-case font-normal text-mute/70">
              Source: US Census Bureau, Rental Housing Finance Survey
            </span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 text-mute">
            <Stat number="$5" label="verified pre-qualification per applicant" />
            <Stat number="0–100" label="AI Tenability™ on every applicant" />
            <Stat number="$9" label="per unit / month for landlords, every feature" />
            <Stat number="50-state" label="lease templates included" />
          </div>
        </div>
      </section>

      {/* ── Feature sections ─────────────────────────────────────────── */}

      <FeatureSection
        eyebrow="Meet Tenability™"
        status="live"
        title="Every applicant arrives with a Tenability™ — a 0–100 score, in minutes."
        body="Tenability™ ($5) gives every applicant a private 0–100 rentability score with verified income and ID. Tenability™ Pro ($25) adds a selfie ID match (free with Pro) and an applicant-provided credit report with AI authenticity scoring. Both tiers are configured to ignore protected-class signals under the Fair Housing Act."
        learnMore="/tenability"
        Icon={ShieldCheck}
        illustrationName="screening"
      />

      <FeatureSection
        eyebrow="Applications"
        status="live"
        title="One standardized application per unit. Side-by-side comparison."
        body="Share a branded apply link, get every applicant filling out the same fields, and review them in a single dashboard. Income, employment, current address, references, pets — all captured the same way every time."
        learnMore="/features"
        Icon={ClipboardList}
        illustrationName="applications"
        reverse
      />

      <FeatureSection
        eyebrow="Lease templates & e-sign"
        status="live"
        title="State-specific lease templates, signed on-screen, finished in minutes."
        body="Choose a template for your state, fill in the unit and rent, send. Both parties sign on phone or laptop. Every signature ships with an audit log — timestamp, IP, and device — so the document holds up later."
        learnMore="/features"
        Icon={FileSignature}
        illustrationName="leases"
      />

      <FeatureSection
        eyebrow="Rent collection"
        status="live"
        title="Stop refreshing your bank app on the first of the month."
        body="Tenants pay by ACH (free) or by card. Reminders go out automatically three days before rent is due. Late fees apply themselves on the timeline you set, in the amount you set."
        learnMore="/features"
        Icon={CreditCard}
        illustrationName="payments"
        reverse
      />

      <FeatureSection
        eyebrow="Maintenance"
        status="live"
        title="Tickets, photos, priority — without the phone calls."
        body="Tenants log requests with photos and a priority level. You triage in the dashboard, add notes the tenant can see, and close out. Every fix stays attached to the unit for the next time something breaks."
        learnMore="/features"
        Icon={Wrench}
        illustrationName="maintenance"
      />

      <FeatureSection
        eyebrow="Messaging"
        status="live"
        title="Every tenant conversation, in one thread per lease."
        body="Stop digging through email. Stoop Messages keeps each tenant's history with you in one searchable place, with unread badges across every device."
        learnMore="/features"
        Icon={MessageSquare}
        illustrationName="messages"
        reverse
      />

      <FeatureSection
        eyebrow="Accounting"
        status="beta"
        title="P&L per property, the way your accountant wants it."
        body="Rent receipts and maintenance costs flow into a per-property income statement. Export to CSV when tax season hits — line items grouped to map cleanly to Schedule E."
        learnMore="/features"
        Icon={BarChart3}
        illustrationName="accounting"
      />

      {/* ── Pricing — single tier ────────────────────────────────────── */}
      <section id="pricing-snapshot" className="py-20 md:py-24 bg-gradient-to-b from-white to-brand-50/40">
        <div className="max-w-3xl mx-auto px-5 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-ink tracking-tight">
              One plan. Every feature. No upsell ladder.
            </h2>
            <p className="mt-4 text-lg text-mute">
              $9 per active unit per month. Every feature included, ACH free for your
              tenants. Pay monthly or save 16.7% with annual prepay.
            </p>
          </div>

          <PlanCard
            name="Stoop"
            price="$9"
            priceSub="/ unit / month"
            tagline="Or $90/unit/year with annual prepay (non-refundable). Every feature included."
            cta="Get started"
            ctaHref="/register"
            features={[
              'Verified pre-qualification on every applicant ($5 paid by applicant)',
              'AI Tenability™ with Fair-Housing-safe scoring',
              'Online rent collection — ACH free for your tenants',
              'State-specific lease templates with e-sign',
              'Maintenance tracking with photos',
              '24/7 tenant portal + messaging per lease',
              'Income & expense tracking with CSV export',
              'Priority human support',
            ]}
            accent="brand"
          />

          <p className="text-center text-sm text-mute mt-8">
            See <Link to="/pricing" className="text-brand-600 font-medium hover:underline">the full pricing page</Link> for billing examples and FAQ.
          </p>
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-500 to-brand-600 text-white">
        <div className="max-w-4xl mx-auto px-5 lg:px-8 py-20 md:py-24 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Your rentals deserve better than a shared spreadsheet.
          </h2>
          <p className="mt-4 text-lg text-white/85 max-w-xl mx-auto">
            Sign up free, add a property, and see how much of your evening
            you've been spending on landlord chores.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 bg-white text-brand-700 hover:bg-brand-50 font-medium px-6 py-3 rounded-lg transition-colors"
            >
              Get started
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center bg-white/10 hover:bg-white/20 text-white font-medium px-6 py-3 rounded-lg transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}

// ─── subcomponents ────────────────────────────────────────────────────

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl md:text-3xl font-bold text-ink">{number}</p>
      <p className="text-xs text-mute mt-0.5 max-w-[140px]">{label}</p>
    </div>
  )
}

interface FeatureSectionProps {
  eyebrow: string
  status: Status
  title: string
  body: string
  learnMore: string
  Icon: LucideIcon
  illustrationName: string
  reverse?: boolean
}

function FeatureSection({ eyebrow, status, title, body, learnMore, Icon, illustrationName, reverse }: FeatureSectionProps) {
  const statusInfo = {
    live: { text: 'Available now', cls: 'bg-green-50 text-green-700 border-green-200' },
    beta: { text: 'In beta', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    soon: { text: 'Coming soon', cls: 'bg-gray-50 text-mute border-gray-200' },
  }[status]

  return (
    <section className="py-16 md:py-20 border-t border-gray-100 first-of-type:border-t-0">
      <div className="max-w-6xl mx-auto px-5 lg:px-8">
        <div className={`grid md:grid-cols-2 gap-10 lg:gap-16 items-center ${reverse ? 'md:[&>*:first-child]:order-2' : ''}`}>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs uppercase tracking-wider text-brand-600 font-semibold">{eyebrow}</p>
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusInfo.cls}`}>
                {statusInfo.text}
              </span>
            </div>
            <h3 className="text-2xl md:text-3xl font-bold text-ink tracking-tight">{title}</h3>
            <p className="mt-4 text-mute leading-relaxed text-lg">{body}</p>
            <Link
              to={learnMore}
              className="mt-5 inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 font-medium text-sm"
            >
              Learn more
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
          </div>
          <Illustration name={illustrationName} Fallback={Icon} />
        </div>
      </div>
    </section>
  )
}

interface PlanCardProps {
  name: string
  price: string
  priceSub: string
  tagline: string
  cta: string
  ctaHref: string
  features: string[]
  accent: 'brand' | 'dark'
}

function PlanCard({ name, price, priceSub, tagline, cta, ctaHref, features, accent }: PlanCardProps) {
  const isDark = accent === 'dark'
  return (
    <article
      className={`rounded-2xl p-7 ${
        isDark
          ? 'bg-ink text-white'
          : 'bg-white border-2 border-brand-200 text-ink'
      }`}
    >
      <p className={`text-xs uppercase tracking-wider font-semibold ${isDark ? 'text-white/60' : 'text-mute'}`}>
        {name}
      </p>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-5xl font-bold">{price}</span>
        <span className={isDark ? 'text-white/60' : 'text-mute'}>{priceSub}</span>
      </div>
      <p className={`text-sm mt-2 ${isDark ? 'text-white/70' : 'text-mute'}`}>{tagline}</p>
      <Link
        to={ctaHref}
        className={`mt-6 inline-flex items-center justify-center gap-2 w-full font-medium px-5 py-2.5 rounded-lg transition-colors ${
          isDark
            ? 'bg-white text-ink hover:bg-white/90'
            : 'bg-brand-500 text-white hover:bg-brand-600'
        }`}
      >
        {cta}
        <ArrowRight className="w-4 h-4" strokeWidth={2} />
      </Link>
      <ul className="mt-7 space-y-2.5">
        {features.map((line) => (
          <li key={line} className="flex items-start gap-2.5 text-sm">
            <Check className={`w-4 h-4 mt-0.5 shrink-0 ${isDark ? 'text-brand-400' : 'text-brand-600'}`} strokeWidth={2.5} />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}

