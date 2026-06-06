import EducationArticle from '../../../components/marketing/EducationArticle'
import { useSeo } from '../../../lib/useSeo'

export default function MoveInChecklistGuide() {
  useSeo({
    title: 'Move-in & move-out checklists for landlords — the deposit-saving guide',
    description: 'A complete guide to using move-in and move-out inspection checklists in residential rentals: what to document, how to photograph, state-by-state security-deposit rules, and how to make the checklist hold up if a dispute reaches small-claims court.',
    path: '/education/move-in-checklist-guide',
  })

  return (
    <EducationArticle
      category="Operations"
      title="Move-in & move-out checklists — the deposit-saving guide for landlords"
      subtitle="A complete walkthrough of how to document unit condition properly, what state laws require, and how a good checklist becomes the only thing standing between you and a small-claims judgment for the full deposit."
      readMinutes={9}
      relatedLinks={[
        { to: '/education/how-to-screen-tenants', label: 'How to screen tenants' },
        { to: '/education/fair-housing-act-guide', label: 'Fair Housing Act compliance' },
        { to: '/features', label: 'See every Stoop feature' },
      ]}
    >
      <p>
        Security deposits are where small-landlord-tenant relationships most often go to court. The
        landlord wants to deduct for damage; the tenant claims it was already there at move-in. Without
        documentation, the default outcome in most states is that the tenant gets the full deposit back —
        and in several states, the landlord owes <strong>double or triple damages</strong> for failing to
        return it properly.
      </p>
      <p>
        A proper move-in and move-out checklist solves this. It's not glamorous. It's also the single
        cheapest piece of insurance a landlord can carry.
      </p>

      <h2>Why the checklist matters legally</h2>
      <p>
        Most state security-deposit statutes work the same way: the landlord can deduct for "damage beyond
        normal wear and tear," but must <strong>itemize</strong> the deductions in writing and return the
        balance within a defined window (typically 14–30 days). If the tenant disputes a deduction in small-
        claims court, the burden of proof is on the landlord to show:
      </p>
      <ol>
        <li>The damage existed at move-out</li>
        <li>The damage did NOT exist at move-in</li>
        <li>The deduction amount is reasonable</li>
      </ol>
      <p>
        Without dated, signed documentation of the move-in condition, you cannot prove #2. The tenant says
        "it was already broken when I moved in" and there's nothing to contradict them. Courts default to
        the tenant.
      </p>
      <p>
        A move-in checklist, signed by both parties on the day of move-in with photos attached, is the
        documentary anchor that makes #2 provable. Same for the move-out checklist — but the move-in is
        the load-bearing one.
      </p>

      <h2>What to document</h2>
      <p>
        The standard six-area walkthrough covers everything that matters in a typical residential unit:
      </p>
      <ul>
        <li><strong>Entry / living room</strong> — walls, floor or carpet, ceiling, windows + blinds, light
        fixtures, doors + locks</li>
        <li><strong>Kitchen</strong> — walls, floor, counters + cabinets, sink + faucet, refrigerator, stove
        / oven, dishwasher, microwave / hood</li>
        <li><strong>Bathrooms</strong> — walls + tile, floor, sink + faucet, toilet, tub / shower, mirror +
        fixtures, vent fan</li>
        <li><strong>Bedrooms</strong> — walls, floor or carpet, closet + shelving, windows + blinds</li>
        <li><strong>Utilities + safety</strong> — smoke detectors, CO detectors, heating / AC, water heater,
        breaker box</li>
        <li><strong>Exterior + common areas</strong> — exterior door + lock, mailbox, parking spot, patio /
        balcony</li>
      </ul>
      <p>
        For each item, rate condition (Excellent / Good / Fair / Poor / Damaged), add notes for anything
        non-obvious, and attach photos.
      </p>

      <h2>Photographs — what makes them defensible</h2>
      <p>
        A photo with no timestamp and no context is essentially worthless in court. Make every photo:
      </p>
      <ul>
        <li><strong>Date-stamped automatically</strong> — phone EXIF data does this. Don't strip it.</li>
        <li><strong>Geotagged</strong> if you can (also EXIF) — proves the photo was taken at the property.</li>
        <li><strong>Wide-frame and close-up pairs</strong> — wide shows context (which room, which wall);
        close-up shows the specific issue (the scratch, the stain).</li>
        <li><strong>Stored in the cloud immediately</strong> — local-only photos can be lost or accused of
        tampering. Upload them to a system that retains an unmodified original.</li>
      </ul>
      <p>
        The minimum for a small unit is 30–40 photos at move-in. For a 3-bedroom house, 60–100.
        Over-documenting is free; under-documenting is the problem.
      </p>

      <h2>Both parties sign it</h2>
      <p>
        The checklist must be signed by both the landlord (or agent) and the tenant at move-in. Walk through
        the unit together. Have the tenant verify each room's condition and sign on the spot. Disagreements
        get noted in writing in the moment — "Tenant notes pre-existing scratch on bedroom door, agreed at
        move-in" — not negotiated months later when memories have drifted.
      </p>
      <p>
        Electronic signatures are valid for this under federal ESIGN and the Uniform Electronic Transactions
        Act in every state. A signed PDF emailed to both parties beats a paper form left in a drawer.
      </p>

      <h2>State-specific rules</h2>
      <p>
        Some states require move-in checklists by statute; in others it's best practice. A few notable rules:
      </p>
      <ul>
        <li><strong>Arizona, Georgia, Hawaii, Kansas, Kentucky, Massachusetts, Michigan, Montana, Nevada,
        New Hampshire, North Dakota, Virginia, Washington, and Wisconsin</strong> have explicit statutory
        requirements for some form of move-in inspection or unit-condition disclosure.</li>
        <li><strong>Massachusetts</strong> requires the landlord to give the tenant a signed statement of
        condition within 10 days of the tenancy starting, and the tenant must sign and return it within 15
        days — or the statement becomes legally binding without the tenant's signature.</li>
        <li><strong>Washington</strong> requires the checklist to be given to the tenant in writing and
        signed by both parties at the start of the tenancy if a deposit is collected.</li>
        <li><strong>California</strong> requires an "initial inspection" available at the tenant's request
        before move-out, allowing the tenant to fix issues before they become deductions.</li>
        <li><strong>Massachusetts and several others</strong> impose <strong>triple damages</strong> on
        landlords who wrongfully withhold deposits.</li>
      </ul>
      <p>
        Check your state's specific deposit-return window and itemization requirements before drafting your
        own checklist policy.
      </p>

      <h2>"Normal wear and tear" — the line</h2>
      <p>
        Landlords cannot deduct for normal wear and tear from the deposit. The line is generally drawn at
        whether the issue resulted from <strong>ordinary use</strong> or from <strong>abuse, negligence, or
        the tenant's pet/guest</strong>.
      </p>
      <p>
        Normal wear and tear (NOT deductible):
      </p>
      <ul>
        <li>Faded paint, small nail holes from picture-hanging, minor scuff marks on walls</li>
        <li>Worn carpet in high-traffic areas after 3–5 years</li>
        <li>Sun fading on curtains and floors</li>
        <li>Light scratches on hardwood from normal use</li>
        <li>Mineral deposits in faucets and shower heads</li>
      </ul>
      <p>
        Damage (deductible):
      </p>
      <ul>
        <li>Large holes in walls, broken windows, broken fixtures</li>
        <li>Carpet stains from spills, pet damage, burns</li>
        <li>Cabinet doors ripped off, appliances broken</li>
        <li>Excessive filth requiring professional cleaning beyond a normal turnover</li>
        <li>Unauthorized paint colors or modifications</li>
      </ul>
      <p>
        For carpets and paint specifically, many courts apply a useful-life depreciation schedule. If you
        replace a 7-year-old carpet because of a $500 stain, you can typically deduct the cost minus the
        depreciation for normal aging.
      </p>

      <h2>The move-out walkthrough</h2>
      <p>
        Schedule the move-out walkthrough <strong>before</strong> the tenant has handed over keys, and ideally
        do it together. The same checklist used at move-in gets re-walked. Any new damage relative to the
        move-in baseline is noted in writing, photographed, and signed by both parties.
      </p>
      <p>
        California uniquely requires landlords to <strong>offer</strong> a pre-move-out inspection so the
        tenant can fix issues themselves before the security deposit is reconciled. Other states allow you
        to skip this step, but offering it anyway prevents 90% of disputes — the tenant fixes the issues
        rather than fight you over them.
      </p>

      <h2>Returning the deposit</h2>
      <p>
        Within your state's statutory window (typically 14–30 days), send the tenant:
      </p>
      <ol>
        <li>The remaining balance of the security deposit (check or ACH)</li>
        <li>An itemized statement of deductions with amounts</li>
        <li>Receipts or invoices for any work over a threshold amount (varies by state)</li>
      </ol>
      <p>
        Miss the window or fail to itemize and you can lose the right to any deductions — and in several
        states owe double or triple damages on top. The deposit-return letter is not the place to cut corners.
      </p>

      <h2 className="faq">FAQ</h2>
      <h3>Can a move-in checklist be electronic only?</h3>
      <p>
        Yes. Federal ESIGN and state UETA acts make electronic signatures legally equivalent to wet
        signatures for residential leases and related documents in every state. A signed PDF with an audit
        trail (timestamp, IP, signed name) is strong evidence — often stronger than a paper form, since
        paper can be backdated.
      </p>
      <h3>What if the tenant refuses to sign the move-in checklist?</h3>
      <p>
        Send it to them in writing (email is fine) with a deadline for objections. If they don't respond by
        the deadline, document the lack of response. In most states, an unsigned-but-delivered checklist
        with a non-response from the tenant carries significant weight in court.
      </p>
      <h3>How long should I keep the checklist?</h3>
      <p>
        At minimum, until 1 year after the tenancy ends — the typical small-claims statute of limitations
        for deposit disputes. In practice, keep them indefinitely. Digital storage is free.
      </p>
      <h3>Can I charge the tenant for the cost of the inspection itself?</h3>
      <p>
        No. The move-in and move-out inspections are part of the cost of doing business; they cannot be
        deducted from the deposit or billed separately. Cleaning fees in some states can only be charged
        to bring the unit to its move-in condition — not for routine cleaning between tenants.
      </p>
      <h3>What if there's damage I can't see at move-in but discover later?</h3>
      <p>
        That's why thorough photography matters. If a stain appears in a closet that didn't get photographed
        at move-in and you can't prove it wasn't there, you generally cannot deduct for it. Build the
        checklist to cover every surface; if it's not photographed, you can't deduct.
      </p>
    </EducationArticle>
  )
}
