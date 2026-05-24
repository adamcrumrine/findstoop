// Branded landing page for Tenability™ — our private AI-generated
// rentability score. Standalone URL (/tenability) so it can rank as a
// dedicated SEO target for branded + descriptive searches.
//
// Marketing posture:
//   • Lead with the brand (Tenability™), not the mechanism
//   • Outcome-led copy: speed, fairness, ease — NOT specifics on how the
//     pipeline works (no model names, no extraction details, no scoring
//     weights). The "secret sauce" stays internal.
//   • Crystal-clear on Fair Housing posture: protected-class blind by
//     design, human-in-the-loop final decision.

import { Link } from 'react-router-dom'
import {
  Sparkles, Clock, Scale, Check, ArrowRight, FileText,
  CreditCard, IdCard, BarChart3,
  type LucideIcon,
} from 'lucide-react'
import { useSeo } from '../../lib/useSeo'

export default function Tenability() {
  useSeo({
    title: 'Tenability™ — the 0–100 AI rentability score',
    description: 'Tenability™ is FindStoop\'s private 0–100 rentability score. Verified income, verified ID, and a Fair-Housing-safe AI assessment — landed on the landlord\'s screen in minutes, not days. $5 per applicant.',
    path: '/tenability',
  })

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-brand-50">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(0,168,150,0.10),transparent_60%)]" />
        <div className="relative max-w-5xl mx-auto px-5 lg:px-8 pt-20 pb-16 md:pt-28 md:pb-20 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-100 px-3 py-1.5 rounded-full mb-5">
            <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
            Live · $5 per applicant
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-ink leading-[1.05] tracking-tight">
            Meet <span className="text-brand-500">Tenability™</span>
          </h1>
          <p className="mt-5 text-lg text-mute max-w-2xl mx-auto">
            A single 0–100 rentability score on every applicant — backed by verified income, verified ID, and an
            AI signal pipeline configured to be Fair Housing safe. In minutes, not days.
          </p>

          <div className="mt-8 inline-flex items-baseline gap-3 bg-white border border-gray-200 rounded-2xl px-6 py-5 shadow-sm">
            <span className="text-6xl font-bold text-brand-600 tabular-nums">87</span>
            <span className="text-sm uppercase tracking-wider text-mute font-semibold">/ 100 Tenability™</span>
          </div>
          <p className="mt-3 text-xs text-mute">Sample score • plain-English summary delivered alongside the application</p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-6 py-3 rounded-lg transition-colors"
            >
              Get started — $9 / unit / month
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
            <Link
              to="/features"
              className="inline-flex items-center gap-1.5 text-brand-700 hover:text-brand-800 font-medium text-sm"
            >
              See every feature →
            </Link>
          </div>
        </div>
      </section>

      {/* ── How it scores ─────────────────────────────────────────────── */}
      <section className="py-20 md:py-24">
        <div className="max-w-5xl mx-auto px-5 lg:px-8">
          <div className="text-center mb-12 max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-wider text-brand-700 font-bold mb-2">What goes into it</p>
            <h2 className="text-3xl md:text-4xl font-bold text-ink tracking-tight">
              Four legitimate signals — nothing more.
            </h2>
            <p className="mt-3 text-mute">
              Tenability™ is built deliberately narrow. We only look at the four signals a landlord can lawfully
              weigh when evaluating a tenant — and we ignore every protected-class signal under the Fair Housing
              Act and applicable state law.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <SignalCard
              Icon={CreditCard}
              title="Income vs. rent"
              body="A real income-to-rent ratio from verified docs — not the number a hopeful applicant typed into a form."
            />
            <SignalCard
              Icon={FileText}
              title="Document consistency"
              body="Does every fact in the application match every fact on every uploaded document? Anomalies surface as flags."
            />
            <SignalCard
              Icon={IdCard}
              title="Identity confidence"
              body="Driver's-license verification with an optional selfie ID match — catches identity fraud cleanly."
            />
            <SignalCard
              Icon={BarChart3}
              title="Self-reported history"
              body="Prior landlord, reason for leaving, evictions, background — the applicant's own answers, taken at face value but cross-referenced where possible."
            />
          </div>

          <div className="mt-12 bg-amber-50 border border-amber-200 rounded-2xl p-5 max-w-3xl mx-auto">
            <p className="text-sm font-semibold text-amber-900 inline-flex items-center gap-2">
              <Scale className="w-4 h-4" strokeWidth={1.75} />
              What's NOT considered
            </p>
            <p className="text-sm text-amber-900 leading-relaxed mt-1">
              Race, color, national origin, religion, sex (including gender identity and sexual orientation),
              familial status, disability, age, military/veteran status, marital status, or source of income
              (including Section 8 vouchers, alimony, child support, and public assistance). Tenability™ is
              configured to ignore these signals entirely. The final rental decision is always made by a human
              landlord.
            </p>
          </div>
        </div>
      </section>

      {/* ── Why it's faster ───────────────────────────────────────────── */}
      <section className="py-20 md:py-24 bg-gradient-to-b from-white to-brand-50/40">
        <div className="max-w-5xl mx-auto px-5 lg:px-8">
          <div className="text-center mb-10 max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-wider text-brand-700 font-bold mb-2">Speed</p>
            <h2 className="text-3xl md:text-4xl font-bold text-ink tracking-tight">
              Days of waiting → minutes of clarity.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <CompareCard
              title="Without Tenability™"
              items={[
                { Icon: Clock, text: 'Call the applicant\'s employer; leave voicemail. Wait.' },
                { Icon: Clock, text: 'Truework or The Work Number — 3 to 7 business days.' },
                { Icon: Clock, text: 'Eyeball PDFs from the applicant; hope they\'re real.' },
                { Icon: Clock, text: 'Repeat for every applicant. Pick the one who waited.' },
              ]}
              tone="neg"
            />
            <CompareCard
              title="With Tenability™"
              items={[
                { Icon: Check, text: 'Applicant uploads docs; verification runs automatically.' },
                { Icon: Check, text: 'Income-to-rent ratio computed from the actual paystub math.' },
                { Icon: Check, text: 'Identity verified against the application; flags surface.' },
                { Icon: Check, text: 'You see the Tenability™ score and a plain-English summary.' },
              ]}
              tone="pos"
            />
          </div>
        </div>
      </section>

      {/* ── Pricing snapshot ──────────────────────────────────────────── */}
      <section className="py-20 md:py-24">
        <div className="max-w-3xl mx-auto px-5 lg:px-8">
          <div className="text-center mb-8">
            <p className="text-xs uppercase tracking-wider text-brand-700 font-bold mb-2">Pricing</p>
            <h2 className="text-3xl md:text-4xl font-bold text-ink tracking-tight">
              Verified, every time — for $5.
            </h2>
            <p className="mt-3 text-mute">
              The applicant pays for their own pre-qualification. You see the score and the summary.
              No subscriptions, no hidden upsells.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
            <PriceRow label="Verified pre-qualification" sub="Includes Tenability™ + verified income + ID" price="$5" />
            <PriceRow label="Selfie ID match (opt-in)" sub="If the landlord requires it — included free with the credit tier" price="+$2" />
            <PriceRow label="Applicant-provided credit history" sub="Applicant uploads their free AnnualCreditReport.gov PDF. Selfie included." price="+$20" />
          </div>

          <div className="text-center mt-10">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-1.5 text-brand-700 hover:text-brand-800 font-medium"
            >
              See full landlord pricing →
            </Link>
          </div>
        </div>
      </section>

      {/* ── FAQ — SEO snippet bait ────────────────────────────────────── */}
      <section className="py-20 md:py-24 bg-gradient-to-b from-brand-50/40 to-white">
        <div className="max-w-3xl mx-auto px-5 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-ink tracking-tight mb-8 text-center">
            Tenability™ — frequently asked
          </h2>
          <div className="space-y-6">
            <Faq q="What is a Tenability™ score?">
              Tenability™ is FindStoop's private 0–100 rentability score for a rental applicant. It combines
              verified income, identity verification, document consistency, and the applicant's self-reported
              history into one number a landlord can read in seconds — alongside a plain-English summary of
              what drove it. Higher is better. It is generated using a proprietary AI pipeline configured to
              ignore protected-class signals under the Fair Housing Act.
            </Faq>
            <Faq q="Is Tenability™ a credit score?">
              No. A Tenability™ score is not a FICO or VantageScore and has no relationship to either. It does
              not pull or read your credit report. Some landlords additionally require an applicant-provided
              credit report ($20 add-on) — but that's an entirely separate document the applicant uploads
              themselves from AnnualCreditReport.gov.
            </Faq>
            <Faq q="Is it FCRA-regulated?">
              No. Tenability™ is an internal signal a landlord uses alongside the applicant's own materials —
              it is not a consumer report from a consumer reporting agency, and it is not used as the basis for
              an automated adverse action. A human landlord always makes the final decision.
            </Faq>
            <Faq q="How does Tenability™ stay Fair Housing safe?">
              The signal pipeline is configured to ignore race, color, national origin, religion, sex, familial
              status, disability, age, military/veteran status, marital status, and source of income protections
              under federal and applicable state law. Only the four legitimate signals listed above are weighed.
            </Faq>
            <Faq q="Who pays — landlord or applicant?">
              The applicant pays the $5 pre-qualification fee directly. Landlords pay $9 per unit per month
              for the FindStoop platform and never pay for individual applications.
            </Faq>
            <Faq q="How long does scoring take?">
              Typically under 60 seconds from the moment the applicant finishes uploading their income docs and
              driver's license. The result lands in the landlord's dashboard alongside the application.
            </Faq>
            <Faq q="Can a landlord see WHY the score is what it is?">
              Yes. Every Tenability™ score ships with a plain-English summary and a set of flags surfacing
              anything anomalous (income-to-rent ratio, document inconsistencies, identity match issues).
            </Faq>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────── */}
      <section className="py-16 md:py-20 bg-ink">
        <div className="max-w-3xl mx-auto px-5 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            Stop calling employers. Start screening with Tenability™.
          </h2>
          <p className="mt-3 text-white/70">
            $9 per unit per month. Applicants pay $5 for pre-qualification. No setup fees, no upsell ladder.
          </p>
          <Link
            to="/register"
            className="mt-6 inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-medium px-6 py-3 rounded-lg transition-colors"
          >
            Create your landlord account
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </Link>
        </div>
      </section>
    </>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function SignalCard({ Icon, title, body }: { Icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 inline-flex items-center justify-center mb-3">
        <Icon className="w-5 h-5" strokeWidth={1.75} />
      </div>
      <p className="font-semibold text-ink">{title}</p>
      <p className="text-sm text-mute mt-1 leading-relaxed">{body}</p>
    </div>
  )
}

function CompareCard({
  title, items, tone,
}: {
  title: string
  items: { Icon: LucideIcon; text: string }[]
  tone: 'pos' | 'neg'
}) {
  const cls = tone === 'pos'
    ? 'border-brand-200 bg-white'
    : 'border-gray-200 bg-gray-50/70'
  const iconCls = tone === 'pos' ? 'text-brand-600' : 'text-mute'
  return (
    <div className={`rounded-2xl border p-5 ${cls}`}>
      <p className="font-semibold text-ink mb-3">{title}</p>
      <ul className="space-y-2.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-ink">
            <it.Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconCls}`} strokeWidth={1.75} />
            <span>{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PriceRow({ label, sub, price }: { label: string; sub: string; price: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-mute mt-0.5">{sub}</p>
      </div>
      <p className="text-lg font-bold text-ink tabular-nums whitespace-nowrap ml-3">{price}</p>
    </div>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-ink">{q}</h3>
      <p className="text-sm text-mute mt-1.5 leading-relaxed">{children}</p>
    </div>
  )
}

