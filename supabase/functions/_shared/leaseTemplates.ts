// State-specific residential lease template generator.
//
// IMPORTANT: This is ORIGINAL boilerplate written for FindStoop. It does NOT
// reproduce copyrighted lease forms from competitors, attorneys, or template
// services. The state-specific notes summarize publicly available statutory
// requirements (security deposit caps, notice periods, mandatory disclosures)
// in our own words — they are not legal advice and should be reviewed by a
// licensed attorney in the jurisdiction before use.
//
// Disclaimer is rendered prominently in the wizard and included in the
// generated document.

export interface LeaseInputs {
  /** Signer's personal name (used in signature block). */
  landlord_name: string
  /** Legal entity name — appears as the "Lessor" throughout the lease body and
   *  in the header. If empty, falls back to landlord_name. */
  landlord_entity?: string
  /** Optional contact channels — appear ONLY in the Notices clause. The
   *  landlord's mailing address is intentionally NOT rendered on the lease. */
  landlord_phone?: string | null
  landlord_email?: string | null
  tenant_name: string
  tenant_email: string
  /** Optional multi-lessee list. When >1 entry, the lease text addresses
   *  them jointly. First entry is also written as the primary tenant_name /
   *  tenant_email for backward compatibility. */
  tenants?: Array<{ name: string; email: string }>
  property_address: string
  unit_label: string
  city: string
  state: string
  zip: string
  start_date: string         // ISO yyyy-mm-dd
  end_date: string           // ISO yyyy-mm-dd
  rent_amount: number
  security_deposit: number
  /** Optional last-month-rent prepayment collected at signing. */
  last_months_prepayment?: number | null
  pet_deposit?: number | null
  payment_due_day: number    // 1..28
  utility_notes?: string | null
  pets_allowed?: boolean
  /** Generation date for the document header. Defaults to today. */
  signing_date?: string
}

export interface StateNotes {
  /** US state postal code, lowercase. */
  code: string
  /** Display name. */
  name: string
  /** Maximum security-deposit cap in plain language (e.g. "1 month's rent"). */
  security_deposit_cap: string
  /** Late-fee constraints summary. */
  late_fee_rule: string
  /** Notice-to-terminate (month-to-month) requirement. */
  termination_notice: string
  /** Mandatory disclosures (free-form list of one-liners). */
  required_disclosures: string[]
}

// ── State notes table ─────────────────────────────────────────────────────────
// Coverage: a sample of the highest-population states to start. Easy to extend.
// All wording is paraphrased and intentionally short. Confirm against current
// statute before relying on it.
export const STATE_NOTES: Record<string, StateNotes> = {
  ca: {
    code: 'ca',
    name: 'California',
    security_deposit_cap: 'Two months\' rent for unfurnished, three for furnished (Civ. Code §1950.5).',
    late_fee_rule: 'Must be a reasonable estimate of damages; flat-fee caps are case law–driven, no fixed statute.',
    termination_notice: 'Month-to-month: 30 days from tenant; 60 days from landlord if tenancy ≥ 1 year.',
    required_disclosures: [
      'Lead-based paint (pre-1978 buildings) — federal requirement.',
      'Megan\'s Law database notice.',
      'Mold disclosure if known.',
      'Bed-bug history (within last 12 months).',
      'Demolition permit if applicable.',
    ],
  },
  ny: {
    code: 'ny',
    name: 'New York',
    security_deposit_cap: 'One month\'s rent (HSTPA 2019).',
    late_fee_rule: 'No charge until rent is 5 days late; cap is the lesser of $50 or 5% of monthly rent.',
    termination_notice: 'Month-to-month: 30/60/90 days depending on tenancy length (1–2 / 2+ years).',
    required_disclosures: [
      'Lead-based paint (pre-1978 buildings) — federal requirement.',
      'Window-guard notice (children under 11) for NYC units.',
      'Bedbug history (within last 12 months) for NYC units — DHCR form.',
      'Sprinkler-system disclosure.',
    ],
  },
  tx: {
    code: 'tx',
    name: 'Texas',
    security_deposit_cap: 'No statutory cap.',
    late_fee_rule: 'Reasonable fee allowed after 2-day grace; statutory safe-harbor at 12% (≤ 4 units) or 10% (> 4 units).',
    termination_notice: 'Month-to-month: 30 days from either party.',
    required_disclosures: [
      'Lead-based paint (pre-1978 buildings) — federal requirement.',
      'Parking-rules addendum if multi-unit.',
      'Tenant remedies notice (Prop. Code §92.056).',
    ],
  },
  fl: {
    code: 'fl',
    name: 'Florida',
    security_deposit_cap: 'No statutory cap.',
    late_fee_rule: 'Must be specified in the lease and reasonably related to costs.',
    termination_notice: 'Month-to-month: 30 days written notice from either party.',
    required_disclosures: [
      'Lead-based paint (pre-1978 buildings) — federal requirement.',
      'Radon gas notice (state-mandated language).',
      'Landlord/owner identity and address (Stat. §83.50).',
      'Deposit-holding institution and interest terms (Stat. §83.49).',
    ],
  },
  il: {
    code: 'il',
    name: 'Illinois',
    security_deposit_cap: 'No state cap; Chicago requires interest on deposits.',
    late_fee_rule: 'Chicago RLTO: $10/mo + 5% of rent over $500. Statewide: must be reasonable.',
    termination_notice: 'Month-to-month: 30 days from either party.',
    required_disclosures: [
      'Lead-based paint (pre-1978 buildings) — federal requirement.',
      'Radon disclosure (residential ground-floor units).',
      'Chicago RLTO summary attachment (Chicago only).',
    ],
  },
  wa: {
    code: 'wa',
    name: 'Washington',
    security_deposit_cap: 'No statutory cap; must be held in trust account at WA bank.',
    late_fee_rule: 'Capped at $75 OR 5% of rent per RCW 19.150 / city ordinances vary.',
    termination_notice: 'Month-to-month: 20 days from tenant; 60 days from landlord (rent change).',
    required_disclosures: [
      'Lead-based paint (pre-1978 buildings) — federal requirement.',
      'Mold disclosure (RCW 59.18.060).',
      'Fire-safety information.',
      'Voter-registration packet (state-mandated).',
    ],
  },
  ma: {
    code: 'ma',
    name: 'Massachusetts',
    security_deposit_cap: 'One month\'s rent; must be in interest-bearing escrow.',
    late_fee_rule: 'Cannot impose until rent is ≥ 30 days late.',
    termination_notice: 'Month-to-month: full rental period (30 days from either party).',
    required_disclosures: [
      'Lead-based paint (pre-1978 buildings) — federal + state form.',
      'Statement of Condition (within 10 days of tenancy or upon deposit).',
      'Interest-bearing account location for deposit.',
    ],
  },
  ga: {
    code: 'ga',
    name: 'Georgia',
    security_deposit_cap: 'No statutory cap.',
    late_fee_rule: 'Must be specified in lease; case-law reasonableness standard.',
    termination_notice: 'Month-to-month: 30 days from landlord; 30 days from tenant.',
    required_disclosures: [
      'Lead-based paint (pre-1978 buildings) — federal requirement.',
      'Flood-history disclosure (if known) — O.C.G.A. §44-7-20.',
      'Move-in condition checklist + deposit-holding institution (≥ 10 units).',
    ],
  },
  co: {
    code: 'co',
    name: 'Colorado',
    security_deposit_cap: 'No statutory cap.',
    late_fee_rule: 'Capped at $50 or 5% of past-due rent; 7-day grace required (HB22-1137).',
    termination_notice: 'Month-to-month: 21 days from either party (rent < 6 months).',
    required_disclosures: [
      'Lead-based paint (pre-1978 buildings) — federal requirement.',
      'Bedbug history (within last 8 months).',
      'Methamphetamine remediation status if known.',
    ],
  },
  az: {
    code: 'az',
    name: 'Arizona',
    security_deposit_cap: '1.5 months\' rent (ARS §33-1321).',
    late_fee_rule: 'Reasonable fee allowed; no statutory cap.',
    termination_notice: 'Month-to-month: 30 days from either party.',
    required_disclosures: [
      'Lead-based paint (pre-1978 buildings) — federal requirement.',
      'Tenant Bill of Rights link (ARS §33-1322).',
      'Move-in inspection checklist on request.',
    ],
  },
  oh: {
    code: 'oh',
    name: 'Ohio',
    security_deposit_cap: 'No statutory cap; if deposit exceeds $50 (or 1 month\'s rent, whichever is greater) AND tenant stays > 6 months, the excess must accrue 5%/yr interest (ORC §5321.16).',
    late_fee_rule: 'No statutory cap; must be reasonable and stated in the lease.',
    termination_notice: 'Month-to-month: 30 days written notice from either party (ORC §5321.17).',
    required_disclosures: [
      'Lead-based paint (pre-1978 buildings) — federal requirement.',
      'Notice of Habitability — disclose any code violations, code-enforcement actions, or utility-termination notices from the prior 12 months (ORC §5321.04(A)(7)).',
      'Notice of Foreclosure — disclose any pending foreclosure proceedings against the property (ORC §5321.17(C)).',
      'Landlord identity and address for notices (ORC §5321.18).',
      '24-hour reasonable notice required before non-emergency entry (ORC §5321.04(A)(8)).',
    ],
  },
}

export const SUPPORTED_STATES = Object.values(STATE_NOTES).sort((a, b) => a.name.localeCompare(b.name))

export function getStateNotes(stateCode: string): StateNotes | null {
  return STATE_NOTES[stateCode.toLowerCase()] ?? null
}

// ── Lease generator ──────────────────────────────────────────────────────────
// This template is based on a residential lease document the user owns —
// commissioned from a licensed attorney for their Ohio rental portfolio.
// Merge fields handle per-tenancy data; the boilerplate clauses are taken
// from that document. Two added clauses (Delivery of Possession, Heat and
// Hot Water) are written separately to cover common topics the source
// document doesn't address.

const DISCLAIMER = `
─────────────────────────────────────────────────────────────────────────────
IMPORTANT — NOT LEGAL ADVICE
This lease is generated by FindStoop using the landlord's lease template.
It is not legal advice and may not address every legal requirement, local
ordinance, or recent statutory change in your state or city. Have it
reviewed by a licensed attorney before signing. By using this draft you
agree FindStoop is not your lawyer and provides no warranty of fitness for
any particular use.
─────────────────────────────────────────────────────────────────────────────
`.trim()

function money(n: number | null | undefined): string {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

function isoToLongDate(iso: string): string {
  // Avoid timezone surprises: parse yyyy-mm-dd manually as a local date.
  const parts = iso?.split('-')
  if (!parts || parts.length !== 3) return iso || ''
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function generateLeaseText(inputs: LeaseInputs): string {
  const notes = getStateNotes(inputs.state)
  const stateName = notes?.name ?? inputs.state.toUpperCase()
  const entity = (inputs.landlord_entity?.trim() || inputs.landlord_name || 'Landlord')
  const entityUpper = entity.toUpperCase()
  const signingDate = inputs.signing_date
    ? isoToLongDate(inputs.signing_date)
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // Term in whole months (always positive).
  const startD = inputs.start_date ? new Date(inputs.start_date) : null
  const endD = inputs.end_date ? new Date(inputs.end_date) : null
  const termMonths = startD && endD && endD > startD
    ? Math.max(1, Math.round((endD.getTime() - startD.getTime()) / (30 * 24 * 60 * 60 * 1000)))
    : 12

  const rent = money(inputs.rent_amount)
  const deposit = money(inputs.security_deposit)
  const prepayment = Number(inputs.last_months_prepayment ?? 0)
  // Payment timing:
  //   • Security deposit → due at lease signing
  //   • First month's rent → due at move-in
  //   • Last month's rent (if collected) → due at move-in alongside first month
  const dueAtSigning = Number(inputs.security_deposit)
  const dueAtMoveIn = Number(inputs.rent_amount) + prepayment
  const prepaymentLine = prepayment > 0
    ? `Last Month's Rent Prepayment: ${money(prepayment)} — collected at move-in and applied solely to the final month's rent of the original term.\n\n`
    : ''

  const fullAddress = `${inputs.property_address}${inputs.unit_label ? `, Unit ${inputs.unit_label}` : ''}, ${inputs.city}, ${stateName} ${inputs.zip}`
  const noticesLessor = [entity, inputs.landlord_phone, inputs.landlord_email]
    .map((v) => v?.toString().trim())
    .filter(Boolean)
    .join(' — ')

  // Build a normalized list of lessees. If inputs.tenants is provided and
  // non-empty, use it; otherwise fall back to a single-tenant list from
  // tenant_name / tenant_email.
  const lesseeList: Array<{ name: string; email: string }> = (inputs.tenants && inputs.tenants.length > 0)
    ? inputs.tenants
    : [{ name: inputs.tenant_name, email: inputs.tenant_email }]

  // Human-readable parties phrase: "Jane Doe", "Jane Doe and John Doe",
  // "Jane Doe, John Doe, and Sam Doe".
  const lesseeNamesPhrase = (() => {
    const names = lesseeList.map((t) => t.name).filter(Boolean)
    if (names.length === 0) return inputs.tenant_name || 'Tenant'
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} and ${names[1]}`
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
  })()

  // "Lessee" → "Lessees" when multiple.
  const isPlural = lesseeList.length > 1
  const lesseeLabel = isPlural ? 'Lessees' : 'Lessee'

  // Pets clause varies by whether pets are allowed.
  const petsClause = inputs.pets_allowed
    ? `The Lessee has the Lessor's written approval for pet(s) under this Lease. A monthly pet fee of $40.00 per dog applies, due with rent. No cats are permitted. All pets must be leashed when outdoors, supervised when not inside the home, and secured during any maintenance visit. Pet waste left on the Property incurs a $25.00 cleanup fee per occurrence. Damage caused by pets is the Lessee's responsibility regardless of the deposit.`
    : `The Lessee has no pets and will not allow pets at the Property for any length of time, including for short visits by guests.`

  // State-specific notes block (appended at the end for reference).
  const stateNotesBlock = notes ? `
STATE-SPECIFIC NOTES — ${stateName.toUpperCase()}
- Security deposit rule: ${notes.security_deposit_cap}
- Late fees: ${notes.late_fee_rule}
- Termination notice (month-to-month): ${notes.termination_notice}
- Required disclosures:
${notes.required_disclosures.map((d) => `    • ${d}`).join('\n')}
`.trim() : ''

  return `
${entityUpper}
Residential Lease and Rental Agreement


PARTIES AND PROPERTY

This Lease is made on ${signingDate}, at ${inputs.city}, ${stateName}, between ${entity} (the "Lessor") and ${lesseeNamesPhrase} (${isPlural ? 'collectively the "Lessees"' : 'the "Lessee"'}). Where more than one person signs as Lessee, all Lessees are jointly and severally liable for every obligation under this Lease.

The Lessor leases to the Lessee the residential property located at ${fullAddress} (the "Property"), under the terms set out below.


LEASE TERM AND RENT

Term: ${termMonths} months, beginning ${isoToLongDate(inputs.start_date)} and ending ${isoToLongDate(inputs.end_date)}.

Monthly Rent: ${rent}, due on day ${inputs.payment_due_day} of each calendar month, in advance. Rent for any partial first or final month will be prorated based on a 30-day month.

Security Deposit: ${deposit} (equal to one month's rent), held by the Lessor as security for the Lessee's performance under this Lease.

${prepaymentLine}Due at Lease Signing: ${money(dueAtSigning)} (Security Deposit).
Due at Move-In: ${money(dueAtMoveIn)} (First Month's Rent${prepayment > 0 ? ' + Last Month\'s Rent' : ''}).


TERMS AND CONDITIONS

1. Payment of Rent

Rent is payable to ${entity} through the FindStoop online portal, or by any other method the Lessor approves in writing (ACH, certified funds, etc.).

All payments received are applied in this order: (a) returned-check fees, (b) late fees, (c) damage charges, (d) past-due rent, (e) current rent.

2. Late Fees

Rent is considered late if it has not been received in full by the end of the 5th day of the month. The Lessee will then owe a late fee of $100.00, plus $25.00 for each additional day rent remains unpaid.

The Lessor may waive late fees at its sole discretion; doing so once does not waive the right to charge them in the future.

3. Returned Payments

Any check, ACH, or electronic payment that is dishonored, declined, or reversed for any reason will incur a $35.00 returned-payment fee, plus any bank fees the Lessor actually incurs. After one returned payment, the Lessor may require all future rent be paid by certified funds or money order.

4. Security Deposit

The Security Deposit secures the Lessee's full performance under this Lease. It is not advance rent and may not be applied by the Lessee toward any month's rent, including the last.

Within 30 days after the Lessee surrenders the Property and provides a written forwarding address (as required by Ohio Revised Code § 5321.16), the Lessor will return the Security Deposit, less lawful deductions itemized in writing, including: unpaid rent, unpaid utility or service charges, damage beyond reasonable wear and tear, cleaning costs to return the Property to move-in condition, and any other amounts the Lessee owes under this Lease.

Smoke odor, pet odor, and damage caused by smoking or pets are not considered normal wear and tear.

5. Pre-Move-In Cancellation

If the Lessee cancels this Lease within 48 hours of signing and before taking possession, the Lessor will refund the Security Deposit and any prepaid rent in full. After that 48-hour window, cancellation by the Lessee before move-in forfeits the Security Deposit and any prepaid last month's rent as liquidated damages. All cancellations must be in writing.

If the Lessor cancels the Lease before move-in for any reason other than the Lessee's default, the Lessor will refund all funds the Lessee has paid.

6. Utility and Service Responsibility

The Lessee is responsible for arranging and paying for the following services for the duration of the tenancy: electric, natural gas, water and sewer, internet and cable, sidewalk snow removal, and trash and recycling containers. The Lessee must place all tenant-paid utilities into the Lessee's name effective the lease start date and keep them in service through the move-out date.

The Lessor is responsible for landscaping. Landscaping handled by the Lessor includes mowing, leaf and debris removal, weed control in beds, and trimming of bushes and small trees. Grass will be kept below 6 inches in height. The Lessee is responsible for keeping all outdoor areas free of trash and personal items so that landscaping can be performed.

7. Use and Occupancy

The Property is rented for residential use only and may be occupied only by the persons named on this Lease and any minor children of the Lessee disclosed in writing to the Lessor. Any other person occupying the Property for more than 14 consecutive days, or more than 21 days total in any 12-month period, requires the Lessor's prior written approval.

The Property will not be used for any unlawful purpose, for any commercial purpose, for short-term rental (e.g., Airbnb, VRBO), or for anything the Lessor's insurer considers a hazard.

8. Joint and Several Liability

If more than one person signs as Lessee, each is fully responsible — individually and together — for the entire rent and every obligation under this Lease. The Lessor may pursue any one Lessee for the full amount owed. Any guarantor of this Lease is bound to the same extent as the Lessee whose obligations are guaranteed.

9. Quiet Enjoyment and Conduct

The Lessee will comply with all applicable laws, ordinances, and regulations, including any city codes that apply to the Property's location. The Lessee will not cause or permit noise, odor, or other disturbance that interferes with neighbors' reasonable enjoyment of their homes, and will not engage in conduct that is offensive, threatening, or disruptive.

Quiet hours apply from 10:00 PM to 7:00 AM. Televisions, audio equipment, and instruments must not be audible outside the Property during these hours.

10. Pets

Pets are not permitted on the Property at any time — even briefly — without the Lessor's prior written approval. ${petsClause}

11. Smoking

The Property and any shared building, deck, balcony, porch, or grounds are non-smoking. The Lessee, the Lessee's household, and the Lessee's guests will not smoke, vape, or use combustible products of any kind on the premises. Damage, odor, or cleaning costs caused by smoking are the Lessee's responsibility and may be deducted from the Security Deposit.

12. Maintenance, Care, and Damage

The Lessee will keep the Property clean, sanitary, and in good repair throughout the tenancy and will return it in the same condition at move-out, normal wear and tear excepted.

The Lessee is responsible at the Lessee's expense for: stopped-up toilets and drains, clogged garbage disposals, broken glass and window screens, damage from windows or doors left open in weather, replacement of light bulbs after move-in, replacement of batteries in smoke and carbon-monoxide detectors, and any damage caused by the Lessee, the Lessee's household, or guests beyond normal wear and tear.

The Lessee will not perform repairs and seek reimbursement without the Lessor's prior written approval. The Lessee will promptly notify the Lessor in writing of any condition needing repair.

Cost of cleaning or repairs needed to return the Property to rentable condition at move-out will be deducted from the Security Deposit.

13. Appliances and Fixtures

The appliances supplied by the Lessor — typically range/stove, refrigerator, washing machine, clothes dryer, and dishwasher unless otherwise noted in writing — remain with the Property. The Lessee will keep them clean and in working condition and will report any malfunction promptly. The Lessor will repair Lessor-owned appliances when the malfunction is not the result of the Lessee's misuse or neglect; the Lessor is not liable for incidental losses (e.g., spoiled food) from an appliance failure.

No waterbeds, no portable washing machines connected to plumbing, and no installation of additional appliances (window AC units, dishwashers, dryers, etc.) without the Lessor's written approval.

14. Alterations

The Lessee will not paint, alter, add to, or improve the Property — including installation of fixtures, shelving that requires anchoring, locks (interior or exterior), security cameras, satellite dishes, or smart-home devices — without the Lessor's prior written approval. The Lessee will not install anything that, when removed, damages walls, plaster, flooring, or trim.

No interior locks may be installed by the Lessee. If the Lessee changes any exterior lock without the Lessor's written approval, the Lessor may re-key the lock and bill the Lessee for the cost.

15. Keys

The Lessor will provide two (2) keys at move-in. Additional or replacement keys are $25.00 each, available during business hours with two business hours' notice.

Lockouts during business hours: the Lessor will assist for a $50.00 service fee. Lockouts outside business hours are the Lessee's responsibility and require a locksmith arranged and paid for by the Lessee. The Lessee must provide the Lessor with any locksmith-issued replacement keys.

16. Trash, Recycling, and Waste

The Lessee will follow all city ordinances for trash, recycling, and yard waste, including container placement, pickup schedules, and lid-closure requirements. The Lessee provides any containers the city does not. Bulk items must be disposed of through proper channels — not left at the curb or in shared areas.

17. Security Systems and Alarms

If the Lessee installs any monitored alarm or security system, the Lessee will register it with the applicable city and provide the access code to the Lessor for emergency use. Any false-alarm fines or municipal charges are the Lessee's responsibility.

18. Basements and Moisture

Where the Property includes a basement, the Lessee acknowledges basements may flood or develop high humidity. The Lessee will keep personal items elevated off the basement floor, will not store irreplaceable items there, and will operate a working dehumidifier if needed to manage humidity. The Lessor is not liable for damage to the Lessee's belongings caused by flooding, leaks, or humidity unless caused by the Lessor's negligence.

19. Pest Control

Responsibility for pest treatment will be determined consistent with the applicable local ordinance for the municipality where the Property is located. The Lessee will notify the Lessor promptly of any pest issue and cooperate fully with treatment, including any required preparation.

20. Condition at Move-In

The Lessee accepts the Property AS IS, except for conditions materially affecting the health or safety of an ordinary person. Within 14 days after move-in, the Lessee will return a written Move-In Inspection Checklist to the Lessor identifying any defects or damage. If no checklist is returned within that window, the Property is presumed to have been delivered in clean, safe, working condition.

The Lessor will furnish working light bulbs in landlord-provided fixtures at move-in. Replacement bulbs after move-in are the Lessee's responsibility.

21. Renter's Insurance

The Lessee will obtain and maintain a renter's insurance policy with at least $100,000 in personal liability coverage and reasonable coverage for personal property, naming ${entity} as an additional interested party. Proof of coverage must be provided to the Lessor within 14 days of the lease start date and at each renewal.

The Lessor's insurance does not cover the Lessee's belongings. The Lessor is not liable for loss of or damage to the Lessee's personal property except where caused by the Lessor's negligence.

22. Lessor Access

The Lessor or its agents may enter the Property after providing the Lessee at least 24 hours' notice for inspection, maintenance, repairs, showings to prospective tenants or buyers, or any other reasonable purpose. The Lessee will not unreasonably withhold consent.

In the event of an emergency — including suspected fire, flood, gas leak, unattended water, or imminent risk of property damage or harm — the Lessor or its agents may enter without notice.

23. Missed Appointments and Maintenance Charges

If the Lessee schedules a maintenance or inspection appointment and fails to be present or otherwise causes a missed visit, the Lessee will reimburse the Lessor for any service-call charges actually incurred (typically $75–$150 depending on the trade).

24. Subletting and Assignment

The Lessee may not assign this Lease or sublet the Property, in whole or in part, without the Lessor's prior written consent, which will not be unreasonably withheld. Any approved sublessee must complete a rental application and pay a $250 sublease processing and damage deposit, in addition to the original Security Deposit.

25. Casualty and Uninhabitability

If the Property is rendered uninhabitable by fire, flood, storm, or other casualty not caused by the Lessee, the Lessor and the Lessee retain all rights provided under Ohio Revised Code § 5321.07 and other applicable Ohio law. The Lessor will make a good-faith effort to restore the Property within a reasonable time or, at the Lessor's option, terminate the Lease; rent abates for any period the Property is uninhabitable.

26. Notice to Vacate and Holdover

This Lease ends on its stated termination date. If neither party gives at least 30 days' written notice before the end of the term, the tenancy continues month-to-month on the same terms, terminable by either party on 30 days' written notice given before the end of a rental month.

If the Lessee remains in possession after the Lease ends or after a valid notice period without the Lessor's written consent, the Lessee will owe prorated daily rent plus a $100.00 daily holdover charge, and the Lessor may begin eviction proceedings and recover any additional damages.

27. Early Termination by the Lessee

If the Lessee terminates this Lease before the end of the term other than as permitted by law, the Lessee remains liable for rent through the end of the term, less any rent actually received from a replacement tenant. The Lessor will make a good-faith effort to re-rent the Property at a reasonable rate but is not required to do so ahead of other available units.

The Lessee will also reimburse the Lessor for reasonable re-letting costs, including advertising and tenant screening.

28. Default and Remedies

Each of the following is a default: (a) failure to pay rent or other amounts when due; (b) breach of any other obligation under this Lease that is not cured within a reasonable time after written notice; (c) use of the Property for any unlawful purpose; (d) abandonment.

Upon default, the Lessor may pursue every remedy available under Ohio law, including termination, eviction under Ohio Revised Code Chapter 1923, and recovery of damages, court costs, and reasonable attorney's fees to the extent allowed by law. The Lessor's remedies are cumulative; choosing one does not waive the others. The Lessor's failure to act on a default does not waive the right to act on it later or to act on subsequent defaults.

29. Limitation of Lessor Liability

Except where caused by the Lessor's negligence or intentional misconduct, the Lessor is not liable to the Lessee, the Lessee's household, or guests for personal injury or property damage arising from: criminal acts of third parties (theft, vandalism, assault); fire, flood, water leaks, sewer backup, rain, wind, ice, snow, lightning, smoke, or utility interruption; or natural events. The Lessor has no duty to remove snow, sleet, or ice but may do so at its discretion.

Nothing in this section waives any right the Lessee has under Ohio Revised Code Chapter 5321 that cannot be waived by agreement.

30. Surrender at Move-Out

At the end of the tenancy, the Lessee will: (a) return all keys, openers, and access devices to the Lessor; (b) leave the Property clean and free of personal belongings and trash; (c) provide a written forwarding address for return of the Security Deposit; and (d) make the Property available for the Lessor's move-out inspection.

Personal property left at the Property after move-out is deemed abandoned and may be disposed of at the Lessee's expense.

31. Governing Law and Venue

This Lease is governed by the laws of the State of Ohio. Any dispute will be resolved in the Franklin County Municipal Court or the Franklin County Court of Common Pleas, as appropriate. The execution of this Lease constitutes the transaction of business in Ohio under Ohio Civ.R. 4.3(A)(1) and Ohio Revised Code § 2307.382.

32. Entire Agreement and Amendments

This Lease, together with any signed addenda, is the entire agreement between the parties and supersedes all prior discussions and writings. Oral promises or representations not contained in this Lease are not binding. Any change to this Lease must be in writing and signed by both parties.

No agent or employee of the Lessor has authority to waive, amend, or terminate this Lease except in writing. The Lessor's failure to enforce any provision does not waive it for the future.

33. Severability

If any provision of this Lease is found unenforceable, the rest remains in effect, and the unenforceable provision will be interpreted, to the extent possible, to come as close to the parties' intent as the law allows.

34. Binding Effect

This Lease binds the parties and their heirs, successors, executors, administrators, and permitted assigns. Recording this Lease in any public records without the Lessor's written consent is a material breach.

35. Notices

All written notices required under this Lease are valid if sent by email, hand delivery, certified mail, or any other method that provides reasonable proof of delivery.

To Lessor: ${noticesLessor || entity}.

To Lessee: at the Property address above, at the email on file, or at any other address the Lessee provides to the Lessor in writing.

36. Delivery of Possession

If the Lessor is unable to deliver possession of the Property to the Lessee on the lease start date for any reason not caused by the Lessee, rent will abate on a daily basis until possession is delivered. The Lessor will not be liable to the Lessee for consequential damages resulting from a delay in delivering possession. If the delay exceeds fourteen (14) days, the Lessee may terminate this Lease by written notice and any prepaid rent and Security Deposit will be refunded in full.

37. Heat and Hot Water

The Lessor will provide and maintain working heating equipment and hot water service in compliance with applicable building and habitability codes. Where the utilities serving the heating equipment and water heater are placed in the Lessee's name under Clause 6, the Lessee is responsible for paying those utility charges; the Lessor's obligation is limited to keeping the equipment itself in working order.


REQUIRED DISCLOSURES

Lead-Based Paint Disclosure (for properties built before 1978)

Housing built before 1978 may contain lead-based paint. Lead from paint, paint chips, and dust can pose health hazards if not managed properly. Lead exposure is especially harmful to young children and pregnant women. Before renting pre-1978 housing, landlords must disclose the presence of known lead-based paint or lead-based paint hazards in the dwelling, and tenants must receive a federally approved pamphlet on lead-poisoning prevention.

Lessor's Disclosure: The Lessor has no knowledge of lead-based paint or lead-based paint hazards at the Property, and has no records or reports about lead-based paint or hazards in the housing. If the Lessor later acquires knowledge or records of lead-based paint hazards, those will be provided as a separate addendum to this Lease.

Lessee Acknowledgment: The Lessee has received the EPA pamphlet "Protect Your Family from Lead in Your Home."

Fair Housing Notice

Under the Ohio Fair Housing Law (Ohio Revised Code § 4112.02(H)) and the federal Fair Housing Act (42 U.S.C. § 3601 et seq.), it is unlawful to discriminate in the sale, rental, financing, or advertising of housing because of race, color, religion, sex, familial status, ancestry, military status, disability, or national origin. ${entity} complies fully with these laws.


ADDENDA

The following addenda, if applicable, are attached and made part of this Lease: Move-In Inspection Checklist; Pet Addendum (if pets are approved); Property-Specific Disclosures (e.g., known defects, shared-element notices, condo association notices).


SIGNATURES

This is a binding legal document. Read it carefully before signing.

${lesseeList.map((t, i) => `${lesseeLabel}${isPlural ? ` #${i + 1}` : ''}
Printed Name: ${t.name}
Email:        ${t.email}
Signature:    ________________________________
Date:         ________________________________`).join('\n\n')}

Lessor — ${entity}
Printed Name: ${inputs.landlord_name}
Signature:    ________________________________
Date:         ________________________________

${stateNotesBlock ? `\n${stateNotesBlock}\n` : ''}

${DISCLAIMER}
`.trim()
}
