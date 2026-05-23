import { Link } from 'react-router-dom'
import {
  ClipboardList, CreditCard, FileSignature, Wrench, MessageSquare,
  ShieldCheck, ArrowRight, type LucideIcon,
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
    title: 'One application, every listing',
    body: 'Fill out a single rental application and reuse it across any FindStoop listing. No copy-pasting your work history for the fifteenth time.',
  },
  {
    Icon: ShieldCheck,
    title: 'A screening report that travels with you',
    body: 'Order your own credit, background, and eviction reports — you pay once, share with as many landlords as you want for the next 30 days.',
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
    description: 'One rental application across every FindStoop listing, a portable screening report, e-sign leases from your phone, and online rent payments with a free ACH option.',
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
                Apply once and reuse it. Pay rent without writing a check. Get
                maintenance done by sending a photo. Renting on FindStoop is the
                way it should've always worked.
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
                Free to create an account. You only pay for screening reports if you order one.
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
              What renting on FindStoop costs
            </h2>
            <p className="mt-3 text-mute">
              No subscription, no monthly fee. You pay for what you use.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
            <Row label="Create an account" sub="Apply, message, see lease docs" price="Free" />
            <Row label="Pay rent by ACH" sub="From any US bank, free for renters" price="$0" />
            <Row label="Pay rent by card" sub="Convenience fee, only if you choose" price="3.5%" />
            <Row label="Order a screening report" sub="Credit + background + eviction, valid 30 days" price="$55" />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-5 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-ink tracking-tight mb-8">
            Renter questions, answered
          </h2>
          <div className="space-y-6">
            <Faq q="Will using FindStoop affect my credit?">
              No. Ordering your own screening report is a soft inquiry — it
              doesn't lower your score and it isn't visible to lenders. Hard
              inquiries only happen when a landlord opens an account or pulls a
              report directly, neither of which we do.
            </Faq>
            <Faq q="My landlord uses FindStoop. Do I have to?">
              You'll get an email invitation. Accept it, set a password, and
              your lease and history come with you. You can keep paying by check
              if you want — but most renters switch to ACH within a month.
            </Faq>
            <Faq q="What happens if there's a dispute over rent?">
              Every payment, message, and maintenance request is timestamped
              and stored. You can export the lease and your payment history at
              any time as a PDF or CSV.
            </Faq>
            <Faq q="Who can see my information?">
              Only you and your landlord. We never sell your data, and your
              screening report is yours — you decide which landlords get to see
              it during the 30-day window.
            </Faq>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-brand-500 to-brand-600 text-white">
        <div className="max-w-3xl mx-auto px-5 lg:px-8 py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Find your next place. Bring your paperwork with you.
          </h2>
          <p className="mt-3 text-white/85">
            Apply once. Use the same report for every FindStoop listing for the next 30 days.
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

