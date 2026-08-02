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
import { useRouteSeo } from '../../lib/useSeo'
import { BRAND } from '../../lib/brand'

export default function Tenability() {
  useRouteSeo('/tenability')

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-brand-50">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgb(var(--brand-grad-from)/0.10),transparent_60%)]" />
        <div className="relative max-w-5xl mx-auto px-5 lg:px-8 pt-20 pb-16 md:pt-28 md:pb-20 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-100 px-3 py-1.5 rounded-full mb-5">
            <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
            Live · From $5 per applicant
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-ink leading-[1.05] tracking-tight">
            Meet <span className="text-brand-500">Tenability™</span>
          </h1>
          <p className="mt-5 text-lg text-mute max-w-2xl mx-auto">
            A single 0–100 rentability score on every applicant — backed by verified income, verified ID, and an
            AI signal pipeline configured to be Fair Housing safe. In minutes, not days. Two tiers:
            <strong className="text-ink"> Tenability™ ($5)</strong> and <strong className="text-ink">Tenability™ Pro ($25)</strong>.
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
              Get started — $5 / unit / month
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
              body="Driver's-license verification on every applicant. Pro adds a selfie ID match — catches identity fraud cleanly."
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

      {/* ── Two tiers ─────────────────────────────────────────────────── */}
      <section className="py-20 md:py-24">
        <div className="max-w-5xl mx-auto px-5 lg:px-8">
          <div className="text-center mb-12 max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-wider text-brand-700 font-bold mb-2">Two tiers, one brand</p>
            <h2 className="text-3xl md:text-4xl font-bold text-ink tracking-tight">
              Pick the depth you need.
            </h2>
            <p className="mt-3 text-mute">
              Tenability™ and Tenability™ Pro both produce the same 0–100 score. Pro looks deeper —
              adding a selfie ID match and an applicant-provided credit report with an authenticity check
              cross-referenced against the rest of the file.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Standard tier */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col">
              <p className="text-xs uppercase tracking-wider text-brand-700 font-bold">Tenability™</p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-4xl font-bold text-ink">$5</span>
                <span className="text-sm text-mute">/ applicant</span>
              </div>
              <p className="mt-2 text-sm text-mute leading-relaxed">
                The standard score. Income verification, ID verification, and an AI-generated 0–100
                Tenability™ — landed on the landlord's screen in minutes.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm">
                <TierFeature included>Income verification (5 income paths)</TierFeature>
                <TierFeature included>Driver's license verification</TierFeature>
                <TierFeature included>0–100 Tenability™ score + plain-English summary</TierFeature>
                <TierFeature included>Income-to-rent ratio + document-anomaly flags</TierFeature>
                <TierFeature>Selfie ID match</TierFeature>
                <TierFeature>Applicant-provided credit report</TierFeature>
                <TierFeature>Authenticity scoring across documents</TierFeature>
              </ul>
            </div>

            {/* Pro tier */}
            <div className="bg-gradient-to-br from-brand-50 to-white rounded-2xl border-2 border-brand-300 p-6 flex flex-col relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white bg-brand-600 px-2.5 py-1 rounded-full">
                Best value
              </span>
              <p className="text-xs uppercase tracking-wider text-brand-700 font-bold">Tenability™ Pro</p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-4xl font-bold text-ink">$25</span>
                <span className="text-sm text-mute">/ applicant</span>
              </div>
              <p className="mt-2 text-sm text-mute leading-relaxed">
                The complete pipeline. Adds a selfie ID match (normally $2 — free with Pro) and an
                applicant-provided credit report with our AI authenticity check against every other
                document on file.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm">
                <TierFeature included>Everything in Tenability™</TierFeature>
                <TierFeature included><strong>Selfie ID match</strong> — included free</TierFeature>
                <TierFeature included><strong>Applicant-provided credit report</strong> from AnnualCreditReport.gov</TierFeature>
                <TierFeature included><strong>Authenticity scoring</strong> cross-referenced against income + ID</TierFeature>
                <TierFeature included>Tamper-signal detection on the credit PDF</TierFeature>
              </ul>
            </div>
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
              Tenability™ is {BRAND.name}'s private 0–100 rentability score for a rental applicant. It combines
              verified income, identity verification, document consistency, and the applicant's self-reported
              history into one number a landlord can read in seconds — alongside a plain-English summary of
              what drove it. Higher is better. It is generated using a proprietary AI pipeline configured to
              ignore protected-class signals under the Fair Housing Act.
            </Faq>
            <Faq q="Is Tenability™ a credit score?">
              No. A Tenability™ score is not a FICO or VantageScore and has no relationship to either. It does
              not pull or read your credit report. <strong>Tenability™ Pro</strong> additionally asks the applicant
              to upload their own free AnnualCreditReport.gov PDF and runs an authenticity check on it — that
              document originates from the applicant, not from a bureau pulled by {BRAND.name}.
            </Faq>
            <Faq q="What's the difference between Tenability™ and Tenability™ Pro?">
              Tenability™ ($5) gives every applicant a 0–100 score based on verified income, ID, and document
              consistency. Tenability™ Pro ($25) keeps all of that and adds a selfie ID match (free with Pro)
              plus an applicant-provided credit report with an AI authenticity score cross-referenced against
              the rest of the file. Pro produces the more defensible score; Standard is faster and cheaper.
              The landlord picks per property.
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
              The applicant pays for their Tenability™ fee directly — $5 for Standard, $25 for Pro. Landlords
              pay $5 per unit per month for the {BRAND.name} platform and never pay for individual applications.
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
            $5 per unit per month. Applicants pay $5 for pre-qualification. No setup fees, no upsell ladder.
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

function TierFeature({ children, included }: { children: React.ReactNode; included?: boolean }) {
  return (
    <li className={`flex items-start gap-2 ${included ? 'text-ink' : 'text-mute/70'}`}>
      {included ? (
        <Check className="w-4 h-4 mt-0.5 text-brand-600 shrink-0" strokeWidth={2.25} />
      ) : (
        <span className="w-4 h-4 mt-0.5 rounded-full border border-gray-300 shrink-0" aria-hidden="true" />
      )}
      <span className="leading-relaxed">{children}</span>
    </li>
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

