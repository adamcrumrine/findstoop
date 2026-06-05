import { Link } from 'react-router-dom'
import {
  ClipboardList, CreditCard, FileSignature, Wrench, MessageSquare,
  ShieldCheck, Sparkles, ArrowRight, type LucideIcon,
} from 'lucide-react'
import { useSeo } from '../../lib/useSeo'

interface Perk {
  Icon: LucideIcon
  title: string
  body: string
}

const perks: Perk[] = [
  {
    Icon: ClipboardList,
    title: 'One standardized application',
    body: 'Fill out the same clean application every time — income, employment, current address, references. No more rewriting your work history into a different PDF for every landlord.',
  },
  {
    Icon: Sparkles,
    title: 'Get verified for $5 — and jump the line',
    body: 'Verified applicants land at the top of the landlord\'s review queue with a Tenability™ — our private AI-generated rentability score the landlord sees with your application. Most decisions come back in under 24 hours instead of 3–7 days. Upload your income docs and ID — you\'re done.',
  },
  {
    Icon: FileSignature,
    title: 'Sign your lease from your phone',
    body: 'Read the lease, ask questions in the same app, and sign on the screen. No printer, no scanner, no waiting on your roommate to mail it back.',
  },
  {
    Icon: CreditCard,
    title: 'Pay rent without writing a check',
    body: 'Free ACH transfers from any US bank. We send a receipt the moment it clears so you have a paper trail you actually control.',
  },
  {
    Icon: Wrench,
    title: 'Maintenance requests that get answered',
    body: 'Snap a photo, set a priority, and submit. Your landlord sees it instantly, and you see status updates as the fix moves along.',
  },
  {
    Icon: MessageSquare,
    title: 'One thread per home, not 200 emails',
    body: 'Every conversation with your landlord lives in one place, searchable, with timestamps. The "wait, didn\'t you say…" arguments end here.',
  },
]

export default function Tenants() {
  useSeo({
    title: 'For renters',
    description: 'Apply for rentals on Stoop with verified pre-qualification for $5, e-sign your lease from your phone, and pay rent free by ACH. Verified applications jump the queue and decisions land in under 24 hours.',
    path: '/tenants',
  })
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-brand-50">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 pt-20 pb-12">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-100 px-3 py-1.5 rounded-full mb-5">
                <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
                For renters
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-ink tracking-tight">
                Renting, with the receipts.
              </h1>
              <p className="mt-5 text-lg text-mute max-w-xl">
                Apply, get verified for $5, and skip ahead of unverified applicants. Sign
                the lease on your phone. Pay rent free by ACH. Send maintenance with a photo.
                Renting on Stoop is the way it should've always worked.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  to="/register/renter"
                  className="inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-6 py-3 rounded-lg transition-colors"
                >
                  Sign up as a renter
                  <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </Link>
                <Link
                  to="/login/renter"
                  className="inline-flex items-center justify-center bg-white border border-gray-200 hover:border-brand-400 text-ink font-medium px-6 py-3 rounded-lg transition-colors"
                >
                  Renter sign in
                </Link>
              </div>
              <p className="mt-4 text-xs text-mute">
                Free to create an account. Pre-qualification is optional — only $5 if you choose it.
              </p>
            </div>
            <div>
              <img
                src="/illustrations/renters.png"
                alt=""
                className="w-full max-w-md mx-auto h-auto"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Perks */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {perks.map(({ Icon, title, body }) => (
            <article key={title} className="bg-white rounded-2xl border border-gray-100 p-6 hover:border-brand-200 hover:shadow-md transition-all">
              <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
              </div>
              <h3 className="text-lg font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm text-mute leading-relaxed">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* What you'll pay */}
      <section className="py-16 bg-gradient-to-b from-white to-brand-50/40">
        <div className="max-w-3xl mx-auto px-5 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-ink tracking-tight">
              What renting on Stoop costs
            </h2>
            <p className="mt-3 text-mute">
              No subscription, no monthly fee. You pay for what you use.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
            <Row label="Create an account + apply" sub="Apply, message, see lease docs" price="Free" />
            <Row label="Tenability™" sub="Income verification + ID verification + your AI Tenability™ score" price="$5" />
            <Row label="Tenability™ Pro" sub="Everything in Tenability™ + selfie ID match + applicant-provided credit + authenticity scoring. Selfie is free." price="$25" />
            <Row label="Pay rent by ACH" sub="From any US bank, free for renters" price="$0" />
            <Row label="Pay rent by card" sub="Convenience fee, only if you choose" price="3.5%" />
          </div>
          <p className="text-xs text-mute text-center mt-3">
            The $20 credit-report tier is a copy of <em>your own</em> AnnualCreditReport.gov report — federally free to pull —
            with our AI consistency check on top. Full bureau-pulled credit + criminal + eviction reports are coming
            soon as a separate upgrade.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-5 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-ink tracking-tight mb-8">
            Renter questions, answered
          </h2>
          <div className="space-y-6">
            <Faq q="What does the $5 pre-qualification get me?">
              It gets you a verified-applicant status with the landlord: confirmed income
              from your paystubs, confirmed identity from your driver's license, and an
              AI-generated Tenability™ the landlord sees alongside your application.
              Verified applications get reviewed first and most get a decision in under
              24 hours.
            </Faq>
            <Faq q="Will pre-qualification affect my credit?">
              No. Pre-qualification doesn't pull your credit at all — it only reads
              the paystubs and driver's license you upload. No credit inquiry, no impact
              on your score. If the landlord later requests a full credit report (coming
              soon), they'll need to ask your permission separately and the FCRA rules
              apply.
            </Faq>
            <Faq q="My landlord uses Stoop. Do I have to?">
              You'll get an email invitation. Accept it, set a password, and
              your lease and history come with you. You can keep paying by check
              if you want — but most renters switch to ACH within a month.
            </Faq>
            <Faq q="What happens to my driver's license and paystubs?">
              Encrypted at rest, shown only to the landlord for the property you applied
              to, and deleted within 90 days of the leasing decision. We never sell your
              data. See our <Link to="/screening-terms" className="text-brand-600 hover:underline">Screening Terms</Link>{' '}
              for the details.
            </Faq>
            <Faq q="What happens if there's a dispute over rent?">
              Every payment, message, and maintenance request is timestamped
              and stored. You can export the lease and your payment history at
              any time as a PDF or CSV.
            </Faq>
            <Faq q="Who can see my information?">
              Only you and your landlord. We never sell your data. Your screening documents
              are scoped to the specific property you applied to — applying somewhere else
              means uploading fresh.
            </Faq>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-brand-500 to-brand-600 text-white">
        <div className="max-w-3xl mx-auto px-5 lg:px-8 py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Apply, get verified, sign on your phone, pay free by ACH.
          </h2>
          <p className="mt-3 text-white/85">
            $5 for a verified pre-qualification that gets you to the front of the landlord's queue.
          </p>
          <Link
            to="/register/renter"
            className="mt-6 inline-flex items-center gap-2 bg-white text-brand-700 hover:bg-brand-50 font-medium px-6 py-3 rounded-lg transition-colors"
          >
            Create my renter account
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </Link>
        </div>
      </section>
    </>
  )
}

function Row({ label, sub, price }: { label: string; sub: string; price: string }) {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div>
        <p className="font-medium text-ink">{label}</p>
        <p className="text-xs text-mute mt-0.5">{sub}</p>
      </div>
      <p className="text-lg font-semibold text-ink">{price}</p>
    </div>
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

