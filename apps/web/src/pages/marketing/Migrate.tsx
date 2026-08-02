// Public-facing migration landing page — SEO target for searches like
// "migrate from Avail" / "alternative to Buildium" / "switch from AppFolio."
//
// Lead-with-outcome copy, per-vendor sections so each vendor name picks up
// its own snippet, big CTA into /register. Includes the same trademark
// disclaimer the in-app wizard shows.

import { Link } from 'react-router-dom'
import {
  ArrowRight, Clock, ShieldCheck, FileText, Sparkles, Check, CheckCircle2,
} from 'lucide-react'
import { useRouteSeo } from '../../lib/useSeo'
import { BRAND } from '../../lib/brand'

interface VendorRow {
  id: string
  label: string
  blurb: string
  exportSteps: string[]
  tested: boolean
}

const VENDORS: VendorRow[] = [
  {
    id: 'avail',
    label: 'Avail',
    blurb: 'Avail (owned by Realtor.com) is one of the most common platforms small landlords outgrow. Our importer maps Avail\'s tenant + property CSVs directly — usually under five minutes per portfolio.',
    exportSteps: [
      'In Avail: Settings → Reports → "Export tenants"',
      'Settings → Reports → "Export properties"',
      `Upload both files into the ${BRAND.name} import wizard`,
    ],
    tested: true,
  },
  {
    id: 'buildium',
    label: 'Buildium',
    blurb: 'Buildium serves mid-sized landlords — our wizard handles the tenant + property exports for portfolios that no longer need Buildium\'s heavier feature set or its per-unit pricing.',
    exportSteps: [
      'Reports → Rental Owner & Tenant Information',
      'Export "Tenant Directory" and "Property Directory" reports as CSV',
      `Upload both files into the ${BRAND.name} import wizard`,
    ],
    tested: false,
  },
  {
    id: 'doorloop',
    label: 'DoorLoop',
    blurb: `DoorLoop's clean CSV exports map directly into ${BRAND.name}. Bring your tenants, units, and lease dates over in one upload pass.`,
    exportSteps: [
      'People → Tenants → Export (CSV)',
      'Properties → Export (CSV)',
      `Upload both files into the ${BRAND.name} import wizard`,
    ],
    tested: false,
  },
  {
    id: 'tenantcloud',
    label: 'TenantCloud',
    blurb: 'TenantCloud uses Custom Reports for exports. The wizard accepts any combination of name, email, property, unit, rent, and lease dates.',
    exportSteps: [
      'Reports → Custom Reports',
      'Build + export a tenant report and a property report as CSV',
      `Upload both files into the ${BRAND.name} import wizard`,
    ],
    tested: false,
  },
  {
    id: 'appfolio',
    label: 'AppFolio',
    blurb: `AppFolio is built for property managers managing dozens to hundreds of units. Small landlords often move to ${BRAND.name} for simpler pricing and a sharper tenant experience.`,
    exportSteps: [
      'Reports → Resident & Lease',
      'Export the resident roster + a property list as CSV',
      `Upload both files into the ${BRAND.name} import wizard`,
    ],
    tested: false,
  },
  {
    id: 'turbotenant',
    label: 'TurboTenant',
    blurb: 'TurboTenant\'s account-data export covers everything our wizard needs. Bring your tenants over without re-entering a single field.',
    exportSteps: [
      'Settings → Account → Export Data',
      'Pick tenant + property CSV exports',
      `Upload both files into the ${BRAND.name} import wizard`,
    ],
    tested: false,
  },
]

export default function Migrate() {
  useRouteSeo('/migrate')

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-brand-50">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgb(var(--brand-grad-from)/0.10),transparent_60%)]" />
        <div className="relative max-w-5xl mx-auto px-5 lg:px-8 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-100 px-3 py-1.5 rounded-full mb-5">
            <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
            5-minute migration · CSV import wizard
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-ink leading-[1.05] tracking-tight">
            Move to {BRAND.name} — without re-entering a single tenant.
          </h1>
          <p className="mt-5 text-lg text-mute max-w-2xl mx-auto">
            Bring your portfolio over from Avail, Buildium, DoorLoop, TenantCloud, AppFolio, or TurboTenant.
            Our import wizard maps the column names automatically, creates your properties and units, and
            sends every tenant a branded migration email so nothing about their lease changes — they just
            sign in to {BRAND.name}.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-6 py-3 rounded-lg transition-colors"
            >
              Start your migration
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-1.5 text-brand-700 hover:text-brand-800 font-medium text-sm"
            >
              See pricing →
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 md:py-24">
        <div className="max-w-5xl mx-auto px-5 lg:px-8">
          <div className="text-center mb-12 max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-wider text-brand-700 font-bold mb-2">How it works</p>
            <h2 className="text-3xl md:text-4xl font-bold text-ink tracking-tight">
              Four steps. About five minutes per portfolio.
            </h2>
          </div>
          <ol className="grid sm:grid-cols-2 gap-4">
            <Step number="1" title="Export from your old platform">
              CSV exports of tenants + properties. Most platforms have a one-click "Export" button in their
              Reports section.
            </Step>
            <Step number="2" title={`Upload to the ${BRAND.name} wizard`}>
              Drop both CSVs into <strong>Manager → Import</strong>. We read the column names automatically
              and preview every row before any data hits your account.
            </Step>
            <Step number="3" title="Review and confirm">
              The wizard shows you what it will create — properties, units, tenants, leases — plus any rows
              with issues so you can fix them before importing.
            </Step>
            <Step number="4" title="Tenants get a branded migration email">
              Each tenant receives a message: "Your landlord moved to {BRAND.name} — your lease came with them.
              Click here to claim your renter account." Nothing about their lease changes.
            </Step>
          </ol>
        </div>
      </section>

      {/* Trust strip — what carries over */}
      <section className="py-16 bg-gradient-to-b from-white to-brand-50/40">
        <div className="max-w-4xl mx-auto px-5 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-ink tracking-tight text-center mb-8">
            What carries over — and what changes.
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-emerald-200 p-5">
              <p className="text-xs uppercase tracking-wider text-emerald-700 font-bold mb-3">Carries over</p>
              <ul className="space-y-2">
                {[
                  'Your properties + units',
                  'Tenant names, emails, phones',
                  'Lease start and end dates',
                  'Rent amounts and security deposits',
                  'Your relationship with each tenant',
                ].map((s) => (
                  <li key={s} className="flex gap-2 text-sm text-ink">
                    <Check className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" strokeWidth={2.25} />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-xs uppercase tracking-wider text-mute font-bold mb-3">What changes</p>
              <ul className="space-y-2 text-sm text-mute">
                <li className="flex gap-2"><Clock className="w-4 h-4 mt-0.5 text-mute shrink-0" strokeWidth={1.75} />Lease PDFs need to be uploaded individually (bulk PDF import is coming)</li>
                <li className="flex gap-2"><Clock className="w-4 h-4 mt-0.5 text-mute shrink-0" strokeWidth={1.75} />Stripe payouts: you'll re-onboard once with Stripe Connect (10 minutes)</li>
                <li className="flex gap-2"><Clock className="w-4 h-4 mt-0.5 text-mute shrink-0" strokeWidth={1.75} />Imported leases land in "Pending" — you activate them when ready</li>
                <li className="flex gap-2"><Clock className="w-4 h-4 mt-0.5 text-mute shrink-0" strokeWidth={1.75} />Cancel your old subscription once tenants confirm move-in</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Per-vendor sections — each is an SEO target */}
      <section className="py-20 md:py-24">
        <div className="max-w-5xl mx-auto px-5 lg:px-8">
          <div className="text-center mb-12 max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-wider text-brand-700 font-bold mb-2">Supported sources</p>
            <h2 className="text-3xl md:text-4xl font-bold text-ink tracking-tight">
              Coming from one of these? You're covered.
            </h2>
            <p className="mt-3 text-mute text-sm">
              Vendor names marked Beta have working parsers but haven't been dogfooded by our own team
              yet. We'd love your feedback if you migrate from one of them.
            </p>
          </div>
          <div className="space-y-4">
            {VENDORS.map((v) => (
              <article key={v.id} className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-2xl font-bold text-ink">Migrate from {v.label}</h3>
                      {!v.tested && (
                        <span className="text-[9px] uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-bold">Beta</span>
                      )}
                    </div>
                    <p className="text-sm text-mute mt-2 leading-relaxed">{v.blurb}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs uppercase tracking-wider text-brand-700 font-bold mb-3">How to export from {v.label}</p>
                    <ol className="space-y-2 text-sm">
                      {v.exportSteps.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-brand-50 text-brand-700 text-[10px] font-bold inline-flex items-center justify-center mt-0.5">{i + 1}</span>
                          <span className="text-ink">{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <p className="text-[11px] text-mute mt-8 leading-relaxed text-center max-w-3xl mx-auto">
            Avail, Buildium, DoorLoop, TenantCloud, AppFolio, and TurboTenant are trademarks of their
            respective owners. {BRAND.legalName} is not affiliated with, endorsed by, or sponsored by any of these
            companies. Vendor names are used only to identify the source of imported data.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 md:py-24 bg-gradient-to-b from-brand-50/40 to-white">
        <div className="max-w-3xl mx-auto px-5 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-ink tracking-tight mb-8 text-center">
            Migration — frequently asked
          </h2>
          <div className="space-y-6">
            <Faq q="How long does the migration actually take?">
              For a portfolio under 25 units, usually under five minutes from export to imported. Larger
              portfolios scale roughly linearly — the import itself takes seconds; the bulk of the time is
              your CSV download from the old platform.
            </Faq>
            <Faq q="Will my tenants be confused?">
              Each tenant receives a branded migration email signed by you: "Your landlord just moved to
              {BRAND.name} — your lease came with them. Click here to claim your renter account." Nothing about
              their lease (rent, dates, terms) changes. They sign in once on {BRAND.name} and continue.
            </Faq>
            <Faq q="What happens to my existing payments?">
              Past payments stay in your previous platform's history. Going forward, tenants pay through
              {BRAND.name} — bank transfer costs them 0.8% capped at $5, card is 3% — both paid by them at checkout. Stripe Connect routes
              funds directly to your bank.
            </Faq>
            <Faq q="What about my signed lease PDFs?">
              Imported leases land in "Pending" status. You upload the signed PDF to each lease's Documents
              tab when activating it. Bulk PDF import is on the roadmap; for now individual uploads work for
              most portfolios.
            </Faq>
            <Faq q="Can I run both platforms in parallel?">
              Yes — and we recommend it for the first billing cycle. Migrate your portfolio, watch the first
              rent collection clear through {BRAND.name}, then cancel your old subscription. No need to take
              a leap.
            </Faq>
            <Faq q="What if the import wizard misreads a row?">
              The wizard shows every row before importing, with errors flagged in yellow. You can edit the
              CSV and re-upload, or skip problematic rows and add them manually after. We don't touch your
              account until you click Import.
            </Faq>
            <Faq q="Does it cost anything to migrate?">
              No. The import wizard is free for everyone — landlord subscribers and trial accounts alike.
              You only pay our standard $9 per unit per month once you activate the imported leases.
            </Faq>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 md:py-20 bg-ink">
        <div className="max-w-3xl mx-auto px-5 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            Ready to move? Five minutes and you're in.
          </h2>
          <p className="mt-3 text-white/70">
            $9 per unit per month. Every feature included. Bring your portfolio with you.
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

function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <li className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-9 h-9 rounded-full bg-brand-600 text-white text-sm font-bold inline-flex items-center justify-center">{number}</span>
        <div>
          <h3 className="font-semibold text-ink text-base">{title}</h3>
          <p className="text-sm text-mute mt-1 leading-relaxed">{children}</p>
        </div>
      </div>
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

// Quiet unused-icon-import nudge for shipping rev-numbers cleanly.
void FileText; void ShieldCheck; void CheckCircle2
