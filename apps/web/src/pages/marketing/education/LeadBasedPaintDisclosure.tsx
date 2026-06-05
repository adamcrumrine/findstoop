import { Link } from 'react-router-dom'
import EducationArticle from '../../../components/marketing/EducationArticle'
import { useSeo } from '../../../lib/useSeo'

export default function LeadBasedPaintDisclosure() {
  useSeo({
    title: 'Lead-based paint disclosure for pre-1978 rentals — federal compliance guide',
    description: 'How to comply with the federal lead-based paint disclosure rule (24 CFR 35.92) for pre-1978 residential rentals: when it applies, what the form requires, penalties for skipping it, and a step-by-step compliance flow.',
    path: '/education/lead-based-paint-disclosure',
  })

  return (
    <EducationArticle
      category="Compliance"
      title="Lead-based paint disclosure for pre-1978 rentals — federal compliance guide"
      subtitle="The federal Residential Lead-Based Paint Hazard Reduction Act applies to nearly every rental property built before 1978. Here's exactly what you have to do — and what happens if you don't."
      readMinutes={8}
      relatedLinks={[
        { to: '/education/fair-housing-act-guide', label: 'Fair Housing Act compliance guide' },
        { to: '/education/move-in-checklist-guide', label: 'Move-in / move-out checklist guide' },
        { to: '/legal/lead-paint-pamphlet', label: 'Read the EPA lead-paint pamphlet' },
      ]}
    >
      <p>
        If you rent out a residential property built before 1978, federal law requires you to give every
        new tenant a specific disclosure about lead-based paint <em>before</em> they sign the lease. The
        statute is the Residential Lead-Based Paint Hazard Reduction Act of 1992, and the operative
        regulation is 24 CFR 35.92. Skipping it is one of the highest-dollar federal compliance violations
        a small landlord can commit.
      </p>
      <p>
        The actual mechanics aren't complicated. The legal exposure for skipping them is enormous. This
        guide walks through both.
      </p>

      <h2>Does it apply to your property?</h2>
      <p>
        The disclosure is required if <strong>all three</strong> are true:
      </p>
      <ol>
        <li>The property is a <strong>residential dwelling</strong> (not commercial, not industrial).</li>
        <li>It was <strong>built before 1978</strong> — the year the federal government banned lead-based
        paint in residential housing.</li>
        <li>You are <strong>leasing or selling it</strong> (the rule covers both transactions).</li>
      </ol>
      <p>
        Exemptions exist but are narrow:
      </p>
      <ul>
        <li><strong>0-bedroom dwellings</strong> like studios where the kitchen is in the same room (rare carve-out)</li>
        <li><strong>Housing certified as lead-free</strong> by a state-licensed lead inspector — paperwork required</li>
        <li><strong>Housing exclusively for the elderly</strong> (62+) where no children under 6 are expected to live</li>
        <li><strong>Short-term rentals of 100 days or less</strong> (vacation rentals, etc.) where no lease renewal is anticipated</li>
        <li><strong>Foreclosure sales</strong> are exempt from the SELLER's disclosure, but if you then RENT a foreclosed pre-1978 property, the rental disclosure still applies</li>
      </ul>
      <p>
        When in doubt, disclose. Over-disclosing has no penalty; under-disclosing carries one.
      </p>

      <h2>What you must give the tenant</h2>
      <p>
        Three items, before the lease is signed:
      </p>
      <ol>
        <li>
          <strong>The EPA pamphlet</strong> "Protect Your Family from Lead in Your Home" — required reading.
          We host it at{' '}
          <Link to="/legal/lead-paint-pamphlet">/legal/lead-paint-pamphlet</Link> and the canonical EPA PDF
          is at{' '}
          <a href="https://www.epa.gov/lead/protect-your-family-sources-lead" target="_blank" rel="noopener noreferrer">
            epa.gov/lead
          </a>.
        </li>
        <li>
          <strong>The federally-required lead warning statement</strong> — exact wording matters; it must
          appear verbatim in the lease.
        </li>
        <li>
          <strong>A disclosure form</strong> stating one of:
          <ul>
            <li>"Lessor has no knowledge of lead-based paint and/or lead-based paint hazards in the housing"
            (the "negative disclosure"), OR</li>
            <li>"Known lead-based paint and/or lead-based paint hazards are present in the housing" along
            with the location and any known information.</li>
          </ul>
        </li>
      </ol>

      <h2>The lead warning statement (verbatim)</h2>
      <p>
        The following text must appear in the lease, exactly as written:
      </p>
      <blockquote>
        <p>
          "Housing built before 1978 may contain lead-based paint. Lead from paint, paint chips, and dust
          can pose health hazards if not managed properly. Lead exposure is especially harmful to young
          children and pregnant women. Before renting pre-1978 housing, lessors must disclose the presence
          of known lead-based paint and/or lead-based paint hazards in the dwelling. Lessees must also
          receive a federally approved pamphlet on lead poisoning prevention."
        </p>
      </blockquote>

      <h2>Records — and how long to keep them</h2>
      <p>
        You must <strong>retain copies of the signed disclosure for at least three years</strong> after the
        lease begins. In practice, keep them forever — digital cost is zero, and if a former tenant raises a
        complaint years later you'll need the document.
      </p>
      <p>
        The records you must keep include the signed lead warning, the signed disclosure form, and
        acknowledgment that the tenant received the EPA pamphlet. If your lease is fully electronic, the
        e-signature audit trail (timestamp + IP + signed name) qualifies as the signed record.
      </p>

      <h2>Penalties for non-compliance</h2>
      <p>
        This is where landlords get bitten. The penalties are <em>per violation</em> — and a "violation" is
        often defined per lease, per disclosure item:
      </p>
      <ul>
        <li>Civil penalties up to <strong>$17,597 per violation</strong> (HUD/EPA, adjusted 2024) — and EPA
        has interpreted "per violation" to mean per missing disclosure item</li>
        <li>Treble damages in private civil suits by tenants</li>
        <li>Criminal penalties for "knowing and willful" violations — fines up to $11,000 per violation and
        up to one year imprisonment</li>
        <li>If a child is harmed by lead in your unit and you skipped the disclosure, the resulting
        personal-injury exposure is essentially unlimited</li>
      </ul>

      <div className="callout">
        <p>
          <strong>The biggest disclosure case of recent years</strong> was a 2017 EPA enforcement against a
          New Jersey property management company that resulted in a $1.46M settlement for systematic
          disclosure failures across 12,000 leases. The disclosure form takes 60 seconds to send. There is
          no plausible business reason to skip it.
        </p>
      </div>

      <h2>What if lead paint IS present?</h2>
      <p>
        Disclosing the presence of lead paint does <strong>not</strong> trigger an obligation to remediate.
        The federal disclosure rule is about information; remediation rules sit elsewhere (often in state
        law, child protective services responses, or municipal housing codes). Specifically:
      </p>
      <ul>
        <li>You must disclose what you <strong>know</strong>. You are not required to test.</li>
        <li>You must share any <strong>existing reports</strong> in your possession — lead inspections,
        risk assessments, abatement records.</li>
        <li>If you DO test (recommended for older buildings with young families), keep the report in the
        property file and share it with every new tenant.</li>
      </ul>

      <h2>The Renovation, Repair, and Painting (RRP) Rule</h2>
      <p>
        Distinct from the disclosure rule but related: if you (or a contractor) disturb more than 6 square
        feet of painted surface interior or 20 square feet exterior in a pre-1978 home during repairs, the
        RRP Rule (40 CFR Part 745, Subpart E) requires:
      </p>
      <ul>
        <li>An EPA-certified renovator must do (or supervise) the work</li>
        <li>Lead-safe work practices must be followed</li>
        <li>The tenant must receive the EPA pamphlet "Renovate Right" before work begins</li>
      </ul>
      <p>
        This applies to maintenance and improvement work, not routine cleaning. Use EPA-certified
        contractors for any sanding, demolition, or paint removal in pre-1978 properties.
      </p>

      <h2>The compliance flow (60 seconds per new lease)</h2>
      <ol>
        <li>Confirm the build year of the property. If 1978 or later, no LBP disclosure needed.</li>
        <li>If pre-1978, draft the lead warning statement into the lease (or use a template that includes it).</li>
        <li>Complete the lessor disclosure section — known LBP or "no knowledge."</li>
        <li>Attach the EPA pamphlet (PDF link or paper copy at signing).</li>
        <li>Both parties sign the disclosure form. Signed copy goes in your property file.</li>
        <li>If you have ANY existing inspection or abatement reports, attach them.</li>
      </ol>
      <p>
        On Stoop, the compliance flow is automated: managers set a Yes/No toggle for "built before 1978"
        on the property, the lead disclosure form generates automatically, both parties sign electronically,
        and the signed PDF lives in the tenant's Documents tab. The whole thing happens before the lease is
        ever sent for signature.
      </p>

      <h2 className="faq">FAQ</h2>
      <h3>My property was built in 1980. Do I still need to disclose?</h3>
      <p>
        No. The cutoff is strict — properties built in 1978 or later are exempt. But many landlords
        voluntarily include a "no known lead" statement for properties built in the 1980s as a courtesy;
        it costs nothing and reassures health-conscious tenants.
      </p>
      <h3>I don't know exactly when my property was built.</h3>
      <p>
        Check the county assessor's records — build year is almost always recorded. If the records are
        ambiguous, disclose. Over-disclosure has no penalty.
      </p>
      <h3>Does the disclosure need to be a separate document, or can it be in the lease?</h3>
      <p>
        Either works — federal law only requires that it be "in writing." Many landlords put the lead
        warning statement in the lease itself and use a separate "Disclosure of Information on Lead-Based
        Paint" form for the actual disclosure + signatures. The separate-form approach makes the
        recordkeeping cleaner.
      </p>
      <h3>What if the tenant won't sign the disclosure?</h3>
      <p>
        You can't lawfully lease the property to them without the signed disclosure. If they refuse, document
        the refusal in writing and decline the application. Continuing to lease without a signed disclosure
        is the actual violation; the tenant's refusal does not waive your obligation.
      </p>
      <h3>Does this apply to month-to-month leases?</h3>
      <p>
        Yes. The rule applies at the start of every new tenancy. If the same tenant renews under the same
        lease, no additional disclosure is required — but if they sign a new lease or you change the terms,
        you must re-disclose.
      </p>
      <h3>What about Airbnb and other short-term rentals?</h3>
      <p>
        The federal rule exempts rentals of 100 days or less where no extension is anticipated. So most
        Airbnb stays don't trigger the disclosure. But longer corporate housing and any rental over 100
        days does — and several states have stricter rules.
      </p>
    </EducationArticle>
  )
}
