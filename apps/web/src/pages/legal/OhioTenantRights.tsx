// Ohio Tenant Rights — Stoop summary of Chapter 5321 of the Ohio
// Revised Code (Landlords and Tenants). This is original prose written
// for Stoop, with direct statutory cites so a reader can verify any
// claim against the official text at codes.ohio.gov.
//
// NOT legal advice. The disclaimer at the bottom of the page makes that
// clear. Statutory facts (deposit interest rules, notice periods, escrow
// procedure) are taken from ORC §§ 5321.04, 5321.05, 5321.06, 5321.13,
// 5321.16, 5321.17, 5321.18.
//
// Linked to from documents (via app://legal/ohio-tenant-rights?lease=X)
// for every Ohio lease that activates or goes upcoming.
//
// Print-friendly: window.print() yields a clean two-column-free PDF.

import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer, Scale } from 'lucide-react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { BRAND } from '../../lib/brand'

export default function OhioTenantRights() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const leaseId = params.get('lease') ?? null
  const back = profile?.role === 'tenant' ? '/tenant/documents'
             : profile?.role === 'manager' ? '/manager/documents'
             : '/'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(back)} className="inline-flex items-center gap-1.5 text-sm font-medium text-mute hover:text-ink">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">
            <Printer className="w-4 h-4" strokeWidth={1.75} />
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto bg-white shadow-sm my-6 print:my-0 print:shadow-none p-10 print:p-0">
        <header className="text-center border-b border-gray-300 pb-6 mb-8">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-mute mb-2">
            <Scale className="w-4 h-4" strokeWidth={1.75} />
            {BRAND.name} — Ohio Tenant Rights Summary
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>
            Your Rights and Obligations as an Ohio Tenant
          </h1>
          <p className="mt-2 text-sm text-mute italic">
            A plain-language summary of Ohio Revised Code Chapter 5321 (Landlords and Tenants).
          </p>
        </header>

        <section className="prose prose-sm max-w-none space-y-5" style={{ fontFamily: 'Georgia, serif' }}>
          <p>
            This document summarizes the rights and obligations that Ohio law gives every residential
            tenant in the state. It is provided to you by your landlord through {BRAND.name} as part of your
            lease packet. Nothing in this document changes the terms of your written lease — Ohio law
            simply sits on top of the lease and protects you regardless of what the lease says about
            certain matters.
          </p>

          {/* 1. Habitable conditions */}
          <h2 className="text-lg font-bold mt-6">1. Your home must be safe and habitable</h2>
          <p>
            Your landlord is required by <strong>ORC § 5321.04(A)</strong> to keep the rented premises
            "in a fit and habitable condition." That means:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>The building, electrical, plumbing, and heating systems must comply with all applicable
              housing, health, and safety codes that materially affect health and safety.</li>
            <li>The landlord must make all repairs reasonably necessary to keep the unit fit to live in.</li>
            <li>Common areas (shared hallways, stairwells, walkways) must be kept safe and sanitary.</li>
            <li>Electrical, plumbing, sanitary, heating, ventilating, and air-conditioning fixtures and
              appliances supplied by the landlord must be kept in good and safe working order.</li>
            <li>The landlord must supply running water, reasonable amounts of hot water, and reasonable
              heat at all times (unless the unit is set up so you supply heat or hot water directly from
              a utility connection you control).</li>
            <li>In buildings with four or more units, the landlord must provide trash receptacles and
              arrange for trash removal.</li>
          </ul>
          <p>
            Your landlord <em>cannot</em> shift these duties to you in the lease. A lease clause that
            tries to do so is unenforceable under <strong>ORC § 5321.13</strong>.
          </p>

          {/* 2. Repairs + escrow */}
          <h2 className="text-lg font-bold mt-6">2. How to ask for repairs — and what to do if they don't happen</h2>
          <p>
            If something at your home needs fixing or you notice a pest or rodent issue, the law
            expects you to <strong>tell your landlord in writing</strong>. {BRAND.name}'s Maintenance tab
            creates a written request automatically — open Maintenance, describe the issue, and submit.
            The timestamp becomes your paper trail.
          </p>
          <p>
            Once your landlord receives written notice, they have a <strong>reasonable amount of time</strong>
            to fix the issue — never more than 30 days for non-emergency repairs, and far less for
            critical items (a broken furnace in mid-January is a matter of days, not weeks).
          </p>
          <p>
            If your landlord doesn't make the repairs within a reasonable time, Ohio law gives you
            three meaningful remedies under <strong>ORC §§ 5321.07–5321.08</strong>:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Apply to court for an order</strong> requiring the landlord to make repairs.</li>
            <li><strong>Ask the court to reduce your rent</strong> until the repairs are made.</li>
            <li><strong>Terminate your lease</strong> and move out.</li>
            <li><strong>Escrow your rent</strong> with the clerk of the municipal or county court instead
              of paying it to the landlord. Once you start escrowing, the court holds the rent until the
              landlord fixes the issue. You must be current on rent to use this option.</li>
          </ul>
          <p className="text-xs text-mute italic">
            Important: you cannot simply stop paying rent. Withholding rent without going through the
            escrow procedure can be grounds for eviction. Use the court process.
          </p>

          {/* 3. Privacy + landlord entry */}
          <h2 className="text-lg font-bold mt-6">3. The landlord must give notice before entering</h2>
          <p>
            <strong>ORC § 5321.04(A)(8)</strong> requires the landlord to give you reasonable notice
            before entering your home and to enter only at reasonable times. <strong>Twenty-four hours
            is presumed reasonable</strong> in the absence of evidence to the contrary.
          </p>
          <p>
            There are limited exceptions: emergencies (a burst pipe, fire), delivery of large parcels
            you've consented to receive, or anything you've agreed to in advance. The landlord can
            enter to inspect, make repairs, supply services, or show the unit to prospective buyers or
            renters — but always with notice.
          </p>
          <p>
            If your landlord enters without proper notice, enters at unreasonable times, or harasses
            you with repeated demands to enter, <strong>ORC § 5321.04(B)</strong> entitles you to
            actual damages, an injunction to stop the conduct, and reasonable attorney's fees — or you
            can terminate the lease.
          </p>

          {/* 4. Security deposits */}
          <h2 className="text-lg font-bold mt-6">4. Security deposit rules</h2>
          <p>
            Under <strong>ORC § 5321.16</strong>:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Any portion of your security deposit that exceeds $50 or one month's rent (whichever is
              greater) earns <strong>5% interest per year</strong>, paid annually, if you stay in
              possession for six months or more.</li>
            <li>When you move out, give your landlord a forwarding address <em>in writing</em>. The
              landlord has <strong>30 days</strong> to return the deposit, minus any itemized deductions
              for unpaid rent or damages.</li>
            <li>If your landlord wrongfully withholds the deposit, the court can order them to pay you
              <strong> twice the amount wrongfully withheld plus your attorney's fees</strong>.</li>
            <li>Ordinary wear and tear is NOT a chargeable damage. Faded paint, slight carpet wear,
              and minor scuffs are the landlord's cost of doing business.</li>
          </ul>
          <p>
            {BRAND.name} stores your forwarding address with your move-out workflow — when you move out,
            update Settings → Profile so we can pass it to your landlord automatically.
          </p>

          {/* 5. Termination */}
          <h2 className="text-lg font-bold mt-6">5. Ending the tenancy</h2>
          <p>
            <strong>ORC § 5321.17</strong> sets the minimum notice for ending a tenancy without a
            fixed term:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Week-to-week tenancies</strong>: at least 7 days' notice before the termination
              date, given by either party.</li>
            <li><strong>Month-to-month tenancies</strong>: at least 30 days' notice before the next
              rental date, given by either party.</li>
            <li><strong>Fixed-term leases</strong>: end on the date stated in the lease unless you
              renew. If you stay past the end date and your landlord accepts rent, the tenancy
              typically continues month-to-month (see your lease's Section 26 for the specifics).</li>
          </ul>
          <p>
            {BRAND.name} sends you reminders 90 and 60 days before your lease ends so you have time to
            decide whether to renew, sign a new fixed-term lease, or move out.
          </p>

          {/* 6. Eviction */}
          <h2 className="text-lg font-bold mt-6">6. Eviction — the only lawful way to make you leave</h2>
          <p>
            Your landlord <strong>cannot</strong> evict you by changing the locks, shutting off utilities,
            or removing your belongings. Ohio law (<strong>ORC § 5321.15</strong>) prohibits
            "self-help" eviction. Doing so makes the landlord liable for your actual damages plus
            reasonable attorney's fees.
          </p>
          <p>
            A lawful eviction goes through court — the landlord serves you a written 3-day or 30-day
            notice, files an eviction action, and obtains a court order. You have the right to appear
            and contest the eviction. For nonpayment of rent, you receive at least 3 days' notice
            before the landlord can file. For other lease violations, you typically receive 30 days
            to cure the problem.
          </p>

          {/* 7. Retaliation */}
          <h2 className="text-lg font-bold mt-6">7. Retaliation is prohibited</h2>
          <p>
            <strong>ORC § 5321.02</strong> prohibits a landlord from raising your rent, reducing
            services, or trying to evict you because you complained to a government agency about
            housing conditions, complained to the landlord, joined a tenants' organization, or
            exercised any other right under Chapter 5321. If your landlord retaliates, you can
            recover actual damages, attorney's fees, and terminate the lease.
          </p>

          {/* 8. Your obligations */}
          <h2 className="text-lg font-bold mt-6">8. Your obligations as a tenant</h2>
          <p>
            Ohio law (<strong>ORC § 5321.05</strong>) requires you to:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Keep your part of the premises safe and sanitary.</li>
            <li>Dispose of trash safely and sanitarily.</li>
            <li>Keep plumbing fixtures as clean as their condition permits.</li>
            <li>Use electrical and plumbing fixtures properly.</li>
            <li>Comply with applicable state and local housing, health, and safety codes.</li>
            <li>Not intentionally or negligently damage the property, and prevent your guests from
              doing so.</li>
            <li>Maintain in good working order any appliance you've agreed to maintain.</li>
            <li>Conduct yourself — and require your guests to conduct themselves — in a manner that
              doesn't disturb your neighbors' peaceful enjoyment.</li>
            <li>Not allow controlled substances on the property.</li>
            <li>Allow the landlord reasonable access (with 24 hours' notice) to inspect, repair, or
              show the unit.</li>
          </ul>

          {/* 9. Discrimination */}
          <h2 className="text-lg font-bold mt-6">9. You cannot be discriminated against</h2>
          <p>
            Both federal law (Fair Housing Act, 42 USC 3601 et seq.) and Ohio law prohibit
            discrimination in housing on the basis of race, color, religion, sex (including sexual
            orientation and gender identity), national origin, familial status (children under 18,
            pregnant women), disability, military status, or ancestry. If you believe you've been
            discriminated against, you can file a complaint with HUD or the Ohio Civil Rights
            Commission, and you can sue privately.
          </p>
          <p>
            A separate <em>Federal Fair Housing Act Notice</em> is included with your lease packet
            on {BRAND.name}.
          </p>

          {/* 10. Where to get help */}
          <h2 className="text-lg font-bold mt-6">10. Where to get help</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Legal aid</strong> (free for low-income tenants): call <strong>1-866-LAW-OHIO</strong>
              to find a legal aid provider in your county.</li>
            <li><strong>Ohio Civil Rights Commission</strong> (housing discrimination): 1-888-278-7101.</li>
            <li><strong>HUD</strong> (federal housing rights): hud.gov/program_offices/fair_housing_equal_opp
              or 1-800-669-9777.</li>
            <li><strong>{BRAND.name} Messages</strong>: open the Messages tab to reach your landlord
              directly through the app. Every message is timestamped and stored.</li>
          </ul>

          {/* 11. Disclaimer */}
          <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs leading-relaxed">
            <p className="font-semibold mb-1">NOT LEGAL ADVICE</p>
            <p>
              This summary is provided for informational purposes only. It is not a substitute for the
              actual text of Ohio Revised Code Chapter 5321, which controls in any dispute. It is not
              legal advice and {BRAND.name} is not your lawyer. The law may change, and individual
              circumstances differ. For advice about your specific situation, consult a licensed
              attorney or call your local legal aid office at 1-866-LAW-OHIO.
            </p>
            <p className="mt-2">
              The full text of Chapter 5321 is publicly available at <span className="font-mono">codes.ohio.gov</span>.
            </p>
          </div>
        </section>

        <footer className="mt-10 pt-6 border-t border-gray-300 text-xs text-mute text-center print:break-before-avoid">
          <p>
            Provided by your landlord through {BRAND.name}. {leaseId && (
              <>
                Filed under lease <span className="font-mono">{leaseId.slice(0, 8)}</span>.
              </>
            )}
          </p>
          <p className="mt-1">
            <Link to="/" className="text-brand-700 hover:underline">{BRAND.domain}</Link>
            {' · '}Sourced from Ohio Revised Code §§ 5321.04, 5321.05, 5321.06, 5321.13, 5321.16, 5321.17, 5321.18.
          </p>
        </footer>
      </div>
    </div>
  )
}
