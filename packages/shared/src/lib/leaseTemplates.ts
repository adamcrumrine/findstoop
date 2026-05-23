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
  landlord_name: string
  landlord_address: string
  tenant_name: string
  tenant_email: string
  property_address: string
  unit_label: string
  city: string
  state: string
  zip: string
  start_date: string         // ISO yyyy-mm-dd
  end_date: string           // ISO yyyy-mm-dd
  rent_amount: number
  security_deposit: number
  pet_deposit?: number | null
  payment_due_day: number    // 1..28
  utility_notes?: string | null
  pets_allowed?: boolean
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
}

export const SUPPORTED_STATES = Object.values(STATE_NOTES).sort((a, b) => a.name.localeCompare(b.name))

export function getStateNotes(stateCode: string): StateNotes | null {
  return STATE_NOTES[stateCode.toLowerCase()] ?? null
}

// ── Generic generator ─────────────────────────────────────────────────────────
// Produces an ORIGINAL plain-text lease draft. Sections cover the standard
// industry topics (parties, term, rent, deposit, occupancy, maintenance,
// utilities, default, termination, governing law, signatures). Wording is
// our own.

const DISCLAIMER = `
─────────────────────────────────────────────────────────────────────────────
IMPORTANT — NOT LEGAL ADVICE
This lease draft is provided by FindStoop as a starting point. It is general
boilerplate and may not address every legal requirement, local ordinance, or
recent statutory change in your state or city. Have it reviewed by a licensed
attorney in the property's jurisdiction before signing. By using this draft
you agree FindStoop is not your lawyer and provides no warranty of fitness
for any particular use.
─────────────────────────────────────────────────────────────────────────────
`.trim()

export function generateLeaseText(inputs: LeaseInputs): string {
  const notes = getStateNotes(inputs.state)
  const term = `${inputs.start_date} through ${inputs.end_date}`
  const rent = `$${Number(inputs.rent_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
  const deposit = `$${Number(inputs.security_deposit).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
  const petDep = inputs.pet_deposit && inputs.pet_deposit > 0
    ? `$${Number(inputs.pet_deposit).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    : 'None'
  const stateName = notes?.name ?? inputs.state.toUpperCase()

  const stateBlock = notes ? `
STATE-SPECIFIC NOTES — ${stateName.toUpperCase()}
- Security deposit cap: ${notes.security_deposit_cap}
- Late fees: ${notes.late_fee_rule}
- Termination notice (month-to-month): ${notes.termination_notice}
- Mandatory disclosures to attach:
${notes.required_disclosures.map((d) => `    • ${d}`).join('\n')}
`.trim() : `
STATE-SPECIFIC NOTES — ${stateName.toUpperCase()}
We do not yet have a published note set for this state. Confirm your state's
deposit cap, late-fee rules, notice periods, and required disclosures with
a local attorney before signing.
`.trim()

  return `
RESIDENTIAL LEASE AGREEMENT

This Residential Lease Agreement ("Agreement") is entered into between the
parties identified below, effective ${inputs.start_date}.

1. PARTIES
   Landlord: ${inputs.landlord_name}
            ${inputs.landlord_address}
   Tenant:   ${inputs.tenant_name}
            (Email: ${inputs.tenant_email})

2. PREMISES
   Landlord rents to Tenant the dwelling described as:
   ${inputs.property_address}${inputs.unit_label ? `, Unit ${inputs.unit_label}` : ''}
   ${inputs.city}, ${stateName} ${inputs.zip}
   (the "Premises").

3. TERM
   The term of this lease begins on ${inputs.start_date} and ends on
   ${inputs.end_date} (${term}), unless terminated earlier under this
   Agreement or applicable law.

4. RENT
   Tenant agrees to pay monthly rent of ${rent}, due on day ${inputs.payment_due_day}
   of each calendar month. Rent is payable through the FindStoop platform.
   Returned-payment fees and applicable late charges (as separately disclosed
   to Tenant) may apply if rent is not paid when due.

5. SECURITY DEPOSIT
   Tenant has paid a security deposit of ${deposit}. The deposit will be held
   and returned in accordance with the laws of ${stateName}. Pet deposit (if any): ${petDep}.

6. OCCUPANCY
   The Premises shall be used as a private residence by Tenant and members of
   Tenant's household. ${inputs.pets_allowed ? 'Pets are permitted subject to a separately documented pet addendum.' : 'Pets are NOT permitted without prior written consent of Landlord.'}
   No portion of the Premises may be sublet or assigned without Landlord's
   prior written consent.

7. UTILITIES & SERVICES
   ${inputs.utility_notes?.trim() || 'Tenant is responsible for all utilities and services unless otherwise specified by separate written addendum.'}

8. MAINTENANCE & REPAIRS
   Landlord shall maintain the Premises in habitable condition consistent
   with applicable law. Tenant shall promptly notify Landlord of maintenance
   issues using the FindStoop maintenance feature and shall not undertake
   structural repairs or alterations without written consent. Tenant agrees
   to keep the Premises clean and sanitary and to avoid damage beyond
   ordinary wear and tear.

9. DEFAULT
   Failure to pay rent when due, or breach of any other obligation under
   this Agreement, constitutes a default. Landlord may pursue any remedy
   permitted by law, including delivery of a notice to cure or quit and
   institution of eviction proceedings, subject to the procedures and
   timelines required by ${stateName} law.

10. TERMINATION
    On lawful termination, Tenant shall surrender possession of the Premises
    in the condition received, normal wear and tear excepted. Either party
    may terminate any holdover month-to-month tenancy in accordance with
    applicable ${stateName} notice requirements.

11. GOVERNING LAW
    This Agreement is governed by the laws of ${stateName} and applicable
    federal law. Required state and federal disclosures (see notes below)
    are incorporated by reference and shall be attached as addenda.

12. ENTIRE AGREEMENT
    This Agreement, together with any signed addenda, constitutes the entire
    agreement between the parties regarding the Premises. Modifications must
    be in writing and signed by both parties.

────────────────────────────────────────────────────────────────────────────
${stateBlock}
────────────────────────────────────────────────────────────────────────────

13. SIGNATURES
    By signing electronically through FindStoop, each party agrees that
    their electronic signature has the same legal effect as a handwritten
    signature under the federal E-Sign Act and applicable ${stateName}
    electronic-signatures law.

    Landlord: ${inputs.landlord_name}
    Date:     ____________________

    Tenant:   ${inputs.tenant_name}
    Date:     ____________________

${DISCLAIMER}
`.trim()
}
