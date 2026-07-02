// Compliance calendar — per-state landlord-tenant rules as data, plus pure
// checks that compare a landlord's actual configuration against them.
//
// The editorial rule here is the same one depositReturn.ts established:
// omission over invention. A state/topic appears in this table ONLY when the
// fact and its citation are solid — Ohio is fully populated from the repo's
// reviewed Ohio content (OhioTenantRights, ORC Chapter 5321 cites,
// DEPOSIT_STATE_RULES), the federal lead-paint disclosure applies everywhere,
// and other states carry only widely-settled statutory facts. When a topic is
// absent the UI says "not in our database yet — check your state's statutes"
// instead of guessing. Every rendered rule carries its citation. Facts, never
// advice — the UI carries the not-legal-advice disclaimer.
//
// Deposit-return deadlines/itemization live in depositReturn.ts
// (DEPOSIT_STATE_RULES) — this module references that table for the deposit
// topic rather than duplicating deadlines, and only adds what that table
// doesn't carry (statutory caps on the deposit amount).

import { getDepositRule } from './depositReturn'

// Re-export the deposit-return rule surface so the compliance UI composes the
// two tables through one import.
export { getDepositRule, UNKNOWN_STATE_DEADLINE_NOTE } from './depositReturn'
export type { DepositStateRule } from './depositReturn'

// ── Types ────────────────────────────────────────────────────────────────────

export interface EntryNoticeRule {
  /** Advance notice before non-emergency entry, or 'reasonable' when the statute doesn't fix a number. */
  hours: number | 'reasonable'
  statuteCite: string
  note?: string
}

export interface DepositComplianceInfo {
  /**
   * Statutory cap on the security deposit, in months of rent. Omitted when
   * the state doesn't cap the amount (capNote still states that as a fact).
   */
  maxDepositMonths?: number
  capNote: string
  statuteCite: string
}

export interface LateFeeCap {
  /** Flat dollar limit, when the statute names one. */
  flatMax?: number
  /** Percentage limit, when the statute names one. */
  percentMax?: number
  /** What the percentage applies to. */
  basis?: 'monthly_rent' | 'past_due_rent'
  /** 'greater': the fee may be as high as the LARGER of the two limits. 'lesser': it must stay under the smaller. */
  kind?: 'greater' | 'lesser'
}

export interface LateFeeRule {
  /** Days rent must be late before any fee can be charged, when the statute fixes one. */
  graceDaysRequired?: number
  /** Structured cap for the automated check (omit when the standard is case-law reasonableness). */
  cap?: LateFeeCap
  /** Plain-fact sentence about the cap / standard — always present. */
  capNote: string
  /** Omitted only when no statute governs late fees (the capNote says so explicitly). */
  statuteCite?: string
}

export interface DisclosureItem {
  id: string
  label: string
  /** When the disclosure is owed ("Before lease signing…"). */
  when: string
  statuteCite: string
  /** In-app tool that helps satisfy it, when one exists. */
  linkTo?: string
  linkLabel?: string
}

export interface TerminationRule {
  /** Notice days to end a month-to-month tenancy (landlord side when the statute is asymmetric — see note). */
  monthToMonthDays: number
  statuteCite: string
  note?: string
}

export interface StateComplianceRules {
  state: string
  stateName: string
  /** YYYY-MM the entry was last reviewed against the cited statutes. */
  lastReviewed: string
  entryNotice?: EntryNoticeRule
  deposit?: DepositComplianceInfo
  lateFees?: LateFeeRule
  /** State-specific disclosures. Federal items are merged in by getRequiredDisclosures. */
  requiredDisclosures?: DisclosureItem[]
  noticeToTerminate?: TerminationRule
}

// ── Federal disclosures (apply in every state) ───────────────────────────────

export const FEDERAL_DISCLOSURES: DisclosureItem[] = [
  {
    id: 'lead-paint',
    label: 'Lead-based paint disclosure (housing built before 1978)',
    when:
      'Before the lease is signed, for any housing built before 1978: disclose known lead-based paint or hazards, share any records, and give the tenant the EPA pamphlet "Protect Your Family from Lead in Your Home."',
    statuteCite: '42 U.S.C. § 4852d; 24 C.F.R. Part 35; 40 C.F.R. Part 745',
    linkTo: '/legal/lead-paint-pamphlet',
    linkLabel: 'Open the EPA pamphlet',
  },
]

// ── State rules table ────────────────────────────────────────────────────────
// Ohio first and fullest — its facts come from the repo's reviewed Ohio pages
// (OhioTenantRights.tsx, ORC Chapter 5321) and depositReturn.ts. Other states
// carry only widely-settled statutory facts; anything uncertain is omitted so
// the UI shows "check your state's statutes" instead of a guess.

export const COMPLIANCE_RULES: Record<string, StateComplianceRules> = {
  OH: {
    state: 'OH',
    stateName: 'Ohio',
    lastReviewed: '2026-07',
    entryNotice: {
      hours: 24,
      statuteCite: 'ORC § 5321.04(A)(8)',
      note:
        'Reasonable notice is required before non-emergency entry, at reasonable times; 24 hours is presumed reasonable. Emergencies (fire, burst pipe) are excepted.',
    },
    deposit: {
      // Return deadline, itemization, and penalties come from
      // DEPOSIT_STATE_RULES (ORC § 5321.16, 30 days) — not repeated here.
      capNote:
        'Ohio sets no cap on the deposit amount. But any portion above $50 or one month’s rent (whichever is greater) earns 5% annual interest, paid annually, if the tenant stays six months or more.',
      statuteCite: 'ORC § 5321.16',
    },
    lateFees: {
      capNote:
        'No Ohio statute sets a grace period or caps late fees. Courts apply a reasonableness standard: the fee must be stated in the lease and bear a reasonable relationship to the actual cost of late payment.',
      // No statuteCite: there is no Ohio late-fee statute — the capNote says so.
    },
    requiredDisclosures: [
      {
        id: 'oh-landlord-identity',
        label: 'Landlord identity and address in the written lease',
        when:
          'Every written rental agreement must contain the name and address of the property owner and of the owner’s agent, if any, so the tenant knows where to send notices.',
        statuteCite: 'ORC § 5321.18',
        linkTo: '/manager/leases',
        linkLabel: 'The lease builder includes this',
      },
    ],
    noticeToTerminate: {
      monthToMonthDays: 30,
      statuteCite: 'ORC § 5321.17(B)',
      note:
        'At least 30 days’ written notice before the periodic rental date, by either party. Week-to-week tenancies require at least 7 days (ORC § 5321.17(A)).',
    },
  },

  TX: {
    state: 'TX',
    stateName: 'Texas',
    lastReviewed: '2026-07',
    deposit: {
      capNote: 'Texas sets no statutory cap on the security deposit amount.',
      statuteCite: 'Tex. Prop. Code ch. 92, subch. C',
    },
    lateFees: {
      graceDaysRequired: 2,
      capNote:
        'A late fee must be stated in the lease and cannot be charged until rent has remained unpaid for at least two full days after the due date. Safe-harbor caps: 12% of monthly rent for buildings with 4 or fewer units, 10% for larger buildings; a higher fee must be justified as a reasonable estimate of the landlord’s damages.',
      statuteCite: 'Tex. Prop. Code § 92.019',
    },
    noticeToTerminate: {
      monthToMonthDays: 30,
      statuteCite: 'Tex. Prop. Code § 91.001',
      note: 'At least one month’s notice by either party, unless the lease specifies a different notice period.',
    },
  },

  FL: {
    state: 'FL',
    stateName: 'Florida',
    lastReviewed: '2026-07',
    deposit: {
      capNote:
        'Florida sets no statutory cap on the security deposit amount. Within 30 days of receiving a deposit, the landlord must tell the tenant in writing how and where it is held (separate account or surety bond) and whether it earns interest.',
      statuteCite: 'Fla. Stat. § 83.49',
    },
    requiredDisclosures: [
      {
        id: 'fl-radon',
        label: 'Radon gas notice',
        when: 'Every Florida lease must contain the state-mandated radon gas notification language.',
        statuteCite: 'Fla. Stat. § 404.056(5)',
      },
      {
        id: 'fl-deposit-holding',
        label: 'Security-deposit holding notice',
        when:
          'Within 30 days of receiving a deposit: written notice of the manner in which it is held and the interest rate, if any.',
        statuteCite: 'Fla. Stat. § 83.49(2)',
      },
      {
        id: 'fl-landlord-identity',
        label: 'Landlord / agent name and address',
        when: 'The landlord must disclose in writing the name and address of the landlord or an authorized agent.',
        statuteCite: 'Fla. Stat. § 83.50',
      },
    ],
  },

  GA: {
    state: 'GA',
    stateName: 'Georgia',
    lastReviewed: '2026-07',
    deposit: {
      capNote: 'Georgia sets no statutory cap on the security deposit amount.',
      statuteCite: 'O.C.G.A. § 44-7-30 et seq.',
    },
    requiredDisclosures: [
      {
        id: 'ga-flood',
        label: 'Flooding history disclosure',
        when:
          'Before the lease is signed, if any part of the living space has been damaged by flooding at least three times in the preceding five years.',
        statuteCite: 'O.C.G.A. § 44-7-20',
      },
      {
        id: 'ga-move-in-list',
        label: 'Move-in condition list before taking a deposit',
        when:
          'Before collecting a security deposit: give the tenant a comprehensive list of existing damage; the tenant has the right to inspect and sign it.',
        statuteCite: 'O.C.G.A. § 44-7-33',
      },
    ],
    noticeToTerminate: {
      monthToMonthDays: 60,
      statuteCite: 'O.C.G.A. § 44-7-7',
      note: 'Sixty days’ notice from the landlord; thirty days’ notice from the tenant.',
    },
  },

  AZ: {
    state: 'AZ',
    stateName: 'Arizona',
    lastReviewed: '2026-07',
    entryNotice: {
      hours: 48,
      statuteCite: 'A.R.S. § 33-1343',
      note: 'At least two days’ notice, entry only at reasonable times; emergencies excepted.',
    },
    deposit: {
      maxDepositMonths: 1.5,
      capNote:
        'Security deposit capped at one and one-half months’ rent (the tenant may voluntarily agree to pay more, but the landlord cannot require it).',
      statuteCite: 'A.R.S. § 33-1321(A)',
    },
    requiredDisclosures: [
      {
        id: 'az-identity-and-act',
        label: 'Owner/manager identity and the Arizona Residential Landlord & Tenant Act',
        when:
          'At or before commencement of the tenancy: written disclosure of the person authorized to manage the premises and the owner (or owner’s agent), and notice that the Act is available from the Arizona Department of Housing.',
        statuteCite: 'A.R.S. § 33-1322',
      },
    ],
    noticeToTerminate: {
      monthToMonthDays: 30,
      statuteCite: 'A.R.S. § 33-1375(B)',
      note: 'At least 30 days’ written notice before the periodic rental date, by either party.',
    },
  },

  CO: {
    state: 'CO',
    stateName: 'Colorado',
    lastReviewed: '2026-07',
    lateFees: {
      graceDaysRequired: 7,
      cap: { flatMax: 50, percentMax: 5, basis: 'past_due_rent', kind: 'greater' },
      capNote:
        'No late fee until rent is at least seven calendar days late. The fee is capped at the greater of $50 or 5% of the past-due rent, must be disclosed in the lease, and may only be charged once per late payment.',
      statuteCite: 'C.R.S. § 38-12-105',
    },
    noticeToTerminate: {
      monthToMonthDays: 21,
      statuteCite: 'C.R.S. § 13-40-107',
      note:
        'Notice is tiered by how long the tenancy has lasted: 21 days for one month to under six months, 28 days for six months to under a year, 91 days for a year or longer. Colorado’s 2024 for-cause eviction law (HB24-1098) further limits when a landlord may decline to renew — check it before serving notice.',
    },
  },

  NC: {
    state: 'NC',
    stateName: 'North Carolina',
    lastReviewed: '2026-07',
    deposit: {
      maxDepositMonths: 2,
      capNote:
        'Deposit capped at two months’ rent for terms longer than month-to-month; one and one-half months’ rent for month-to-month tenancies (two weeks’ rent for week-to-week).',
      statuteCite: 'N.C. Gen. Stat. § 42-51',
    },
    lateFees: {
      graceDaysRequired: 5,
      cap: { flatMax: 15, percentMax: 5, basis: 'monthly_rent', kind: 'greater' },
      capNote:
        'For monthly tenancies, rent must be at least five days late before a fee can be charged, and the fee is capped at the greater of $15 or 5% of the monthly rent. It must be stated in the lease and may only be charged once per late payment.',
      statuteCite: 'N.C. Gen. Stat. § 42-46',
    },
    noticeToTerminate: {
      monthToMonthDays: 7,
      statuteCite: 'N.C. Gen. Stat. § 42-14',
      note: 'At least seven days’ notice for month-to-month tenancies (two days for week-to-week).',
    },
  },

  PA: {
    state: 'PA',
    stateName: 'Pennsylvania',
    lastReviewed: '2026-07',
    deposit: {
      maxDepositMonths: 2,
      capNote:
        'Deposit capped at two months’ rent during the first year of the lease, and one month’s rent after the first year.',
      statuteCite: '68 P.S. § 250.511a',
    },
  },

  MI: {
    state: 'MI',
    stateName: 'Michigan',
    lastReviewed: '2026-07',
    deposit: {
      maxDepositMonths: 1.5,
      capNote: 'Security deposit capped at one and one-half months’ rent.',
      statuteCite: 'MCL 554.602',
    },
    requiredDisclosures: [
      {
        id: 'mi-deposit-notice',
        label: 'Security-deposit notice',
        when:
          'Within 14 days of the tenant taking possession: written notice of the landlord’s name and address, the financial institution or bond holding the deposit, and the tenant’s obligation to provide a forwarding address within 4 days of moving out.',
        statuteCite: 'MCL 554.603',
      },
      {
        id: 'mi-inventory-checklist',
        label: 'Move-in / move-out inventory checklists',
        when:
          'At the start of the tenancy: two blank copies of an inventory checklist itemizing the condition of the unit; the tenant returns one within 7 days of moving in.',
        statuteCite: 'MCL 554.608',
      },
    ],
  },
}

// ── Lookups ──────────────────────────────────────────────────────────────────

export function getComplianceRules(state: string | null | undefined): StateComplianceRules | null {
  const code = (state ?? '').trim().toUpperCase()
  return COMPLIANCE_RULES[code] ?? null
}

/**
 * Everything the landlord must disclose in this state: federal items (which
 * apply everywhere, even for states not in our table) followed by
 * state-specific ones.
 */
export function getRequiredDisclosures(state: string | null | undefined): DisclosureItem[] {
  return [...FEDERAL_DISCLOSURES, ...(getComplianceRules(state)?.requiredDisclosures ?? [])]
}

/** Copy for a topic we don't have on file — conservative, never a made-up rule. */
export function notOnFileNote(state: string | null | undefined): string {
  const rules = getComplianceRules(state)
  const label = rules?.stateName ?? ((state ?? '').trim().toUpperCase() || 'your state')
  return `Not in our database yet — check ${label}’s statutes before relying on a default.`
}

// ── Pure checks ──────────────────────────────────────────────────────────────

export type ComplianceFlagLevel = 'ok' | 'info' | 'warning'

export interface ComplianceFlag {
  level: ComplianceFlagLevel
  message: string
  statuteCite?: string
}

/** The subset of the landlord's profile late-fee config the check needs (see Settings). */
export interface LateFeeConfigLike {
  late_fee_enabled: boolean
  late_fee_amount: number
  late_fee_grace_days: number
  late_fee_type: 'flat' | 'percent'
  late_fee_percent: number
}

const usd = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 })

function monthsLabel(months: number): string {
  if (months === 1) return 'one month’s rent'
  return `${months} months’ rent`
}

/**
 * Compare the landlord's Settings late-fee config against the state's rule.
 * Returns [] when late fees are off or the state's rule isn't on file;
 * otherwise one flag per conflict, or a single 'ok' flag when consistent.
 */
export function checkLateFeeCompliance(
  config: LateFeeConfigLike | null | undefined,
  state: string | null | undefined,
): ComplianceFlag[] {
  const rules = getComplianceRules(state)
  const rule = rules?.lateFees
  if (!rule || !config || !config.late_fee_enabled) return []

  const flags: ComplianceFlag[] = []

  if (rule.graceDaysRequired != null && config.late_fee_grace_days < rule.graceDaysRequired) {
    flags.push({
      level: 'warning',
      statuteCite: rule.statuteCite,
      message:
        `Your ${config.late_fee_grace_days}-day grace period is shorter than the ${rule.graceDaysRequired} days ` +
        `${rules.stateName} requires before a late fee can be charged.`,
    })
  }

  const cap = rule.cap
  if (cap) {
    const basisLabel = cap.basis === 'past_due_rent' ? 'past-due rent' : 'monthly rent'

    if (config.late_fee_type === 'flat' && cap.flatMax != null && config.late_fee_amount > cap.flatMax) {
      if (cap.kind === 'greater' && cap.percentMax != null) {
        flags.push({
          level: 'warning',
          statuteCite: rule.statuteCite,
          message:
            `Your flat ${usd(config.late_fee_amount)} late fee is above the ${usd(cap.flatMax)} limit — it only stays ` +
            `within the cap when it is no more than ${cap.percentMax}% of the ${basisLabel}.`,
        })
      } else {
        flags.push({
          level: 'warning',
          statuteCite: rule.statuteCite,
          message: `Your flat ${usd(config.late_fee_amount)} late fee exceeds the ${usd(cap.flatMax)} cap.`,
        })
      }
    }

    if (config.late_fee_type === 'percent' && cap.percentMax != null) {
      if (config.late_fee_percent > cap.percentMax) {
        if (cap.kind === 'greater' && cap.flatMax != null) {
          flags.push({
            level: 'warning',
            statuteCite: rule.statuteCite,
            message:
              `A ${config.late_fee_percent}% late fee is above the ${cap.percentMax}% limit — it exceeds the cap ` +
              `whenever ${config.late_fee_percent}% of the ${basisLabel} is more than ${usd(cap.flatMax)}.`,
          })
        } else {
          flags.push({
            level: 'warning',
            statuteCite: rule.statuteCite,
            message: `A ${config.late_fee_percent}% late fee is above the ${cap.percentMax}% cap.`,
          })
        }
      } else if (cap.basis === 'past_due_rent') {
        // Our percent fee applies to the monthly rent; this state's cap applies
        // to the amount actually past due — a partially-paid month can push a
        // rent-based fee over the cap even at an allowed percentage.
        flags.push({
          level: 'info',
          statuteCite: rule.statuteCite,
          message:
            `Your fee is calculated from the monthly rent, but ${rules.stateName}’s cap is ${cap.percentMax}% of the ` +
            `amount actually past due — a partially-paid month could put the fee over the cap.`,
        })
      }
    }
  }

  if (flags.length === 0) {
    flags.push({
      level: 'ok',
      statuteCite: rule.statuteCite,
      message: `Your late-fee settings look consistent with the ${rules.stateName} limits we track.`,
    })
  }
  return flags
}

/**
 * Flag a deposit held above the state's statutory cap, or null when the state
 * has no cap on file or the numbers don't allow a determination.
 */
export function checkDepositCap(
  deposit: number | null | undefined,
  monthlyRent: number | null | undefined,
  state: string | null | undefined,
): ComplianceFlag | null {
  const rules = getComplianceRules(state)
  const info = rules?.deposit
  if (!info || info.maxDepositMonths == null) return null
  const dep = Number(deposit)
  const rent = Number(monthlyRent)
  if (!Number.isFinite(dep) || dep <= 0 || !Number.isFinite(rent) || rent <= 0) return null
  const maxAllowed = info.maxDepositMonths * rent
  if (dep <= maxAllowed) return null
  return {
    level: 'warning',
    statuteCite: info.statuteCite,
    message:
      `A ${usd(dep)} deposit on ${usd(rent)}/mo rent is above ${rules.stateName}’s cap of ` +
      `${monthsLabel(info.maxDepositMonths)} (${usd(maxAllowed)}).`,
  }
}

/**
 * Deposit-topic summary composing both tables: the return rule (deadline,
 * itemization, penalties) from depositReturn.ts and the cap info from here.
 * Either half may be null when not on file.
 */
export function getDepositCompliance(state: string | null | undefined) {
  return {
    returnRule: getDepositRule(state),
    capInfo: getComplianceRules(state)?.deposit ?? null,
  }
}
