// Deposit return — pure logic for the landlord-side deposit-return wizard.
//
// Deposit disputes are how small landlords end up in small-claims court, so
// this module encodes the statutory facts as data keyed by state — Ohio first
// (ORC § 5321.16), the same coverage as the rest of document automation. When
// a state isn't in the table we deliberately return "unknown" so the UI can
// say "check your state's statute" instead of guessing a deadline. Facts with
// citations, never advice — the UI carries the not-legal-advice disclaimers.

// ── State rules ──────────────────────────────────────────────────────────────

export interface DepositStateRule {
  state: string
  /** Days after move-out to return the deposit with the itemized statement. */
  deadlineDays: number
  /** TRUE when deadlineDays counts business days (Mon–Fri), not calendar days. */
  businessDays?: boolean
  /** Nuance the single number can't carry (tiered/interim deadlines). */
  deadlineNote?: string
  statuteCite: string
  /** The statute requires an itemized list of deductions. */
  requiresItemization: boolean
  /** The return clock is tied to the tenant providing a forwarding address. */
  forwardingAddressMatters: boolean
  /** Plain-fact line about ordinary wear and tear. */
  wearAndTearNote: string
  /** What missing the deadline / wrongful withholding exposes the landlord to. */
  penaltyNote: string
  /** States that require interest on held deposits — a fact the wizard should surface. */
  interestNote?: string
  /** YYYY-MM the entry was last reviewed against the cited statute. */
  verifiedAsOf: string
}

// Editorial rule (same as complianceRules.ts): omission over invention. A
// state appears here only when the deadline and its citation are solid;
// deadlines that a lease can shift or that tier by circumstance say so in
// deadlineNote, and the SHORTER statutory obligation is the one the countdown
// uses — the safe direction for the landlord.
export const DEPOSIT_STATE_RULES: Record<string, DepositStateRule> = {
  OH: {
    state: 'OH',
    deadlineDays: 30,
    statuteCite: 'ORC § 5321.16',
    requiresItemization: true,
    forwardingAddressMatters: true,
    wearAndTearNote:
      'Ohio law does not allow deductions for ordinary wear and tear — faded paint, worn carpet, and routine cleaning from normal use generally can’t be charged (ORC § 5321.16).',
    penaltyNote:
      'A deposit wrongfully withheld exposes a landlord to twice the amount wrongfully withheld plus reasonable attorney’s fees (ORC § 5321.16).',
    interestNote:
      'Any deposit portion above $50 or one month’s rent (whichever is greater) earns 5% annual interest, paid annually, when the tenant stays six months or more (ORC § 5321.16(A)).',
    verifiedAsOf: '2026-07',
  },
  TX: {
    state: 'TX',
    deadlineDays: 30,
    statuteCite: 'Tex. Prop. Code § 92.103',
    requiresItemization: true,
    forwardingAddressMatters: true,
    deadlineNote:
      'The 30-day clock runs from surrender; the landlord isn’t required to return the deposit until the tenant gives a forwarding address, but the tenant never forfeits it by not doing so (Tex. Prop. Code § 92.107).',
    wearAndTearNote:
      'Texas law does not allow deductions for normal wear and tear — deterioration from ordinary use, not negligence or abuse (Tex. Prop. Code §§ 92.001(4), 92.104(b)).',
    penaltyNote:
      'Bad-faith retention exposes a landlord to $100 plus three times the amount wrongfully withheld plus reasonable attorney’s fees (Tex. Prop. Code § 92.109).',
    verifiedAsOf: '2026-07',
  },
  FL: {
    state: 'FL',
    deadlineDays: 15,
    statuteCite: 'Fla. Stat. § 83.49(3)',
    requiresItemization: true,
    forwardingAddressMatters: false,
    deadlineNote:
      'Two paths: return the full deposit within 15 days, OR mail written notice of intent to impose a claim (with the reason) by certified mail within 30 days — the tenant then has 15 days to object. Missing the 30-day notice forfeits the right to claim against the deposit (Fla. Stat. § 83.49(3)(a)).',
    wearAndTearNote:
      'The claim notice must state the reason for imposing it; Florida’s statute does not authorize claims for ordinary wear from normal use (Fla. Stat. § 83.49(3)(a)).',
    penaltyNote:
      'Failing to give the required notice forfeits the landlord’s right to impose a claim on the deposit; in a deposit lawsuit the prevailing party recovers court costs and attorney’s fees (Fla. Stat. § 83.49(3)).',
    interestNote:
      'If the deposit is held in an interest-bearing account, the tenant is owed at least 75% of the annualized average interest or 5% simple interest, at the landlord’s election (Fla. Stat. § 83.49(1)).',
    verifiedAsOf: '2026-07',
  },
  GA: {
    state: 'GA',
    deadlineDays: 30,
    statuteCite: 'O.C.G.A. § 44-7-34',
    requiresItemization: true,
    forwardingAddressMatters: false,
    wearAndTearNote:
      'Georgia law does not allow retaining the deposit for ordinary wear and tear (O.C.G.A. § 44-7-34(a)); deductions must trace to the move-in/move-out condition lists the statute requires (O.C.G.A. § 44-7-33).',
    penaltyNote:
      'Bad-faith retention exposes a landlord to three times the amount wrongfully withheld plus reasonable attorney’s fees (O.C.G.A. § 44-7-35(c)).',
    verifiedAsOf: '2026-07',
  },
  AZ: {
    state: 'AZ',
    deadlineDays: 14,
    businessDays: true,
    statuteCite: 'A.R.S. § 33-1321(D)',
    requiresItemization: true,
    forwardingAddressMatters: false,
    deadlineNote:
      'Fourteen BUSINESS days (excluding weekends and legal holidays) from termination and delivery of possession.',
    wearAndTearNote:
      'Deductions are limited to unpaid rent and damages beyond normal wear and tear, with an itemized list (A.R.S. § 33-1321(D)).',
    penaltyNote:
      'Wrongful retention exposes a landlord to the amount wrongfully withheld plus damages of twice that amount (A.R.S. § 33-1321(E)).',
    verifiedAsOf: '2026-07',
  },
  CO: {
    state: 'CO',
    deadlineDays: 30,
    statuteCite: 'C.R.S. § 38-12-103',
    requiresItemization: true,
    forwardingAddressMatters: false,
    deadlineNote:
      'One month by default; the lease may extend this up to a maximum of 60 days. The countdown here uses the one-month default — check your lease.',
    wearAndTearNote:
      'Colorado law does not allow retaining the deposit for normal wear and tear — deterioration from ordinary, intended use (C.R.S. §§ 38-12-102(1), 38-12-103(1)).',
    penaltyNote:
      'Failing to deliver the itemized statement in time forfeits ALL rights to withhold any portion; willful wrongful retention exposes a landlord to treble damages plus attorney’s fees and costs (C.R.S. § 38-12-103(2)–(3)).',
    verifiedAsOf: '2026-07',
  },
  NC: {
    state: 'NC',
    deadlineDays: 30,
    statuteCite: 'N.C. Gen. Stat. § 42-52',
    requiresItemization: true,
    forwardingAddressMatters: false,
    deadlineNote:
      'Thirty days; if the full damage assessment isn’t complete, an interim accounting is due at 30 days and the final accounting at 60 days.',
    wearAndTearNote:
      'Damage deductions exclude ordinary wear and tear; permitted uses of the deposit are listed in the statute (N.C. Gen. Stat. §§ 42-51, 42-52).',
    penaltyNote:
      'Willful failure to comply voids the landlord’s right to retain any portion of the deposit; the tenant may also recover attorney’s fees (N.C. Gen. Stat. § 42-55).',
    verifiedAsOf: '2026-07',
  },
  PA: {
    state: 'PA',
    deadlineDays: 30,
    statuteCite: '68 P.S. § 250.512',
    requiresItemization: true,
    forwardingAddressMatters: true,
    deadlineNote:
      'Thirty days from termination or surrender. The double-damages remedy depends on the tenant having provided a forwarding address in writing (68 P.S. § 250.512(e)).',
    wearAndTearNote:
      'Deductions must be for actual damages to the leasehold premises, itemized in the written list — not ordinary wear from normal use (68 P.S. § 250.512(a)).',
    penaltyNote:
      'Missing the 30-day list forfeits the right to withhold any portion (and to sue for damages to the premises); failing to return the difference within 30 days exposes the landlord to double the deposit (68 P.S. § 250.512(b)–(c)).',
    interestNote:
      'Deposits held longer than two years must be escrowed, and interest earned from the start of the third year belongs to the tenant, paid annually (68 P.S. §§ 250.511a–250.511b).',
    verifiedAsOf: '2026-07',
  },
  MI: {
    state: 'MI',
    deadlineDays: 30,
    statuteCite: 'MCL 554.609',
    requiresItemization: true,
    forwardingAddressMatters: true,
    deadlineNote:
      'Itemized list of damages within 30 days of termination. The tenant must give a written forwarding address within 4 days of moving out (MCL 554.611); if the tenant disputes the deductions, the landlord must sue within 45 days or return the disputed amount (MCL 554.613).',
    wearAndTearNote:
      'Deductions are limited to unpaid rent/utilities and damages beyond reasonable wear and tear from the tenant’s use (MCL 554.607).',
    penaltyNote:
      'Wrongful retention in violation of the act exposes a landlord to double the amount wrongfully withheld (MCL 554.613(2)).',
    verifiedAsOf: '2026-07',
  },
}

/** Copy for states we don't have on file — conservative, never a made-up number. */
export const UNKNOWN_STATE_DEADLINE_NOTE =
  'We don’t have this state’s deposit-return deadline on file. Most states require the itemized statement within 14–30 days of move-out — check your state’s statute before relying on a date.'

export function getDepositRule(state: string | null | undefined): DepositStateRule | null {
  const code = (state ?? '').trim().toUpperCase()
  return DEPOSIT_STATE_RULES[code] ?? null
}

// ── Date math (ISO YYYY-MM-DD, UTC-safe) ─────────────────────────────────────

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Add business days (Mon–Fri). Legal holidays are NOT skipped — the computed
 * date can only be earlier than the true statutory deadline, which is the
 * safe direction for a countdown.
 */
export function addBusinessDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  let remaining = days
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) remaining--
  }
  return d.toISOString().slice(0, 10)
}

/** "30 days" / "14 business days" — for composing rule sentences. */
export function deadlineDaysLabel(rule: DepositStateRule): string {
  return `${rule.deadlineDays}${rule.businessDays ? ' business' : ''} days`
}

/** Whole days from `fromIso` to `toIso` (positive when `toIso` is later). */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00Z').getTime()
  const b = new Date(toIso + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86_400_000)
}

/**
 * The statutory return deadline for a move-out date, or null when the state's
 * rule isn't on file (the caller should show the check-your-state copy).
 */
export function depositDeadline(moveOutIso: string | null | undefined, state: string | null | undefined): string | null {
  const rule = getDepositRule(state)
  if (!rule || !moveOutIso || !ISO_RE.test(moveOutIso)) return null
  return rule.businessDays
    ? addBusinessDaysIso(moveOutIso, rule.deadlineDays)
    : addDaysIso(moveOutIso, rule.deadlineDays)
}

export type DeadlineUrgency = 'ok' | 'urgent' | 'overdue'

export function deadlineUrgency(daysLeft: number): DeadlineUrgency {
  if (daysLeft < 0) return 'overdue'
  if (daysLeft <= 7) return 'urgent'
  return 'ok'
}

// ── Deduction line items + math ──────────────────────────────────────────────

export type DeductionCategory = 'cleaning' | 'damage' | 'unpaid_rent' | 'other'

export const DEDUCTION_CATEGORIES: Array<{ value: DeductionCategory; label: string }> = [
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'damage', label: 'Damage beyond wear and tear' },
  { value: 'unpaid_rent', label: 'Unpaid rent' },
  { value: 'other', label: 'Other' },
]

export const DEDUCTION_CATEGORY_LABELS: Record<DeductionCategory, string> =
  Object.fromEntries(DEDUCTION_CATEGORIES.map((c) => [c.value, c.label])) as Record<DeductionCategory, string>

export interface DeductionLine {
  id: string
  description: string
  category: DeductionCategory
  amount: number
}

export interface DepositMath {
  deposit: number
  totalDeductions: number
  /** What goes back to the tenant (never negative). */
  refund: number
  /** What the tenant still owes when deductions exceed the deposit. */
  balanceOwed: number
}

const cents = (n: number) => Math.round(n * 100) / 100

export function computeDepositMath(deposit: number | null | undefined, lines: DeductionLine[]): DepositMath {
  const dep = Number(deposit)
  const safeDeposit = Number.isFinite(dep) && dep > 0 ? cents(dep) : 0
  const total = cents(lines.reduce((sum, l) => {
    const a = Number(l.amount)
    return sum + (Number.isFinite(a) && a > 0 ? a : 0)
  }, 0))
  return {
    deposit: safeDeposit,
    totalDeductions: total,
    refund: cents(Math.max(0, safeDeposit - total)),
    balanceOwed: cents(Math.max(0, total - safeDeposit)),
  }
}

const usd = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Render the deduction lines as the itemized text block the letter template
 * expects (one deduction per line: category — description: amount).
 */
export function formatDeductionsForLetter(lines: DeductionLine[]): string {
  if (lines.length === 0) return 'No deductions — the full deposit is being returned.'
  return lines
    .map((l) => `${DEDUCTION_CATEGORY_LABELS[l.category]} — ${l.description.trim()}: ${usd(cents(Math.max(0, Number(l.amount) || 0)))}`)
    .join('\n')
}

// ── Suggested deductions from the move-in vs move-out inspection ─────────────
// Structural types so this stays a pure module (the real shapes live in
// @findstoop/shared useInspection — ChecklistRoom / ChecklistItem).

export interface InspectionItemLike {
  key: string
  name: string
  condition: string | null
  notes: string
  photos: string[]
}

export interface InspectionRoomLike {
  name: string
  items: InspectionItemLike[]
}

// Higher = better condition — same ranking InspectionCompare uses to flag
// "more wear" rows; a decline is the evidence base for a deduction.
const CONDITION_RANK: Record<string, number> = { excellent: 4, good: 3, fair: 2, poor: 1, damaged: 0 }
const CONDITION_LABEL: Record<string, string> = {
  excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor', damaged: 'Damaged',
}

export function conditionWorsened(from: string | null | undefined, to: string | null | undefined): boolean {
  if (!from || !to) return false
  if (!(from in CONDITION_RANK) || !(to in CONDITION_RANK)) return false
  return CONDITION_RANK[to] < CONDITION_RANK[from]
}

export interface SuggestedDeduction {
  /** Stable id: room + item key. */
  key: string
  room: string
  item: string
  /** Prefilled line-item description citing the recorded conditions. */
  description: string
  category: DeductionCategory
  fromCondition: string | null
  toCondition: string | null
  /** Move-out inspector notes, when recorded. */
  notes: string
  /** Move-out photo storage paths — the evidence attached to the item. */
  photoPaths: string[]
}

/**
 * Items whose condition declined between the move-in and move-out inspections,
 * shaped as one-click deduction suggestions. Items that only got to
 * poor/damaged default to the "damage" category; milder declines default to
 * "other" so the landlord judges them against ordinary wear and tear.
 */
export function suggestDeductionsFromInspections(
  moveInRooms: InspectionRoomLike[] | null | undefined,
  moveOutRooms: InspectionRoomLike[] | null | undefined,
): SuggestedDeduction[] {
  if (!moveInRooms?.length || !moveOutRooms?.length) return []
  const moveInByRoom = new Map<string, Map<string, InspectionItemLike>>()
  for (const room of moveInRooms) {
    moveInByRoom.set(room.name, new Map(room.items.map((i) => [i.key, i])))
  }

  const out: SuggestedDeduction[] = []
  for (const room of moveOutRooms) {
    const startItems = moveInByRoom.get(room.name)
    if (!startItems) continue
    for (const item of room.items) {
      const start = startItems.get(item.key)
      if (!start || !conditionWorsened(start.condition, item.condition)) continue
      const from = start.condition ?? null
      const to = item.condition ?? null
      const severe = to === 'poor' || to === 'damaged'
      const notes = (item.notes ?? '').trim()
      const condLine = `${CONDITION_LABEL[from ?? ''] ?? from} at move-in, ${CONDITION_LABEL[to ?? ''] ?? to} at move-out`
      out.push({
        key: `${room.name}:${item.key}`,
        room: room.name,
        item: item.name,
        description: `${room.name} — ${item.name} (${condLine}${notes ? `; ${notes}` : ''})`,
        category: severe ? 'damage' : 'other',
        fromCondition: from,
        toCondition: to,
        notes,
        photoPaths: item.photos ?? [],
      })
    }
  }
  return out
}

// ── Which leases need a deposit return? (the Leases-page nudge) ─────────────

/** How long after move-out a lease keeps its nudge row (covers overdue ones). */
export const DEPOSIT_LOOKBACK_DAYS = 45
/** How far before an upcoming move-out the row appears. */
export const DEPOSIT_LOOKAHEAD_DAYS = 14

export interface DepositLeaseLike {
  id: string
  status: string
  end_date: string
  security_deposit: number | null
  month_to_month?: boolean
  tentative_move_out_date?: string | null
  /** Set when the tenancy was never administered through Stoop — see below. */
  collections_paused_at?: string | null
}

/**
 * The date the tenancy ends (or ended) for deposit purposes, or null when we
 * can't tell — e.g. a month-to-month tenancy with no recorded move-out date
 * (the tenant is still there; the stale end_date would be a false alarm).
 */
export function effectiveMoveOutDate(lease: DepositLeaseLike, todayIso: string): string | null {
  if (lease.tentative_move_out_date && ISO_RE.test(lease.tentative_move_out_date)) {
    return lease.tentative_move_out_date
  }
  if (!ISO_RE.test(lease.end_date ?? '')) return null
  if (lease.status === 'expired' || lease.status === 'terminated') return lease.end_date
  if (lease.status === 'active') {
    // A fixed-term lease ending soon counts; one whose end_date already passed
    // while still 'active' has rolled to month-to-month — no move-out yet.
    if (lease.month_to_month) return null
    return lease.end_date >= todayIso ? lease.end_date : null
  }
  return null
}

export interface DepositReturnCandidate<T extends DepositLeaseLike> {
  lease: T
  moveOut: string
}

/**
 * Leases with a held deposit whose move-out lands inside the nudge window:
 * recently ended (up to DEPOSIT_LOOKBACK_DAYS ago, so overdue returns still
 * surface) or ending within DEPOSIT_LOOKAHEAD_DAYS. Sorted soonest-ended first.
 */
export function depositReturnCandidates<T extends DepositLeaseLike>(
  leases: T[],
  todayIso: string,
): Array<DepositReturnCandidate<T>> {
  const from = addDaysIso(todayIso, -DEPOSIT_LOOKBACK_DAYS)
  const to = addDaysIso(todayIso, DEPOSIT_LOOKAHEAD_DAYS)
  const out: Array<DepositReturnCandidate<T>> = []
  for (const lease of leases) {
    // A paused lease is one Stoop never administered — imported history for a
    // tenancy that ran somewhere else, where the deposit was never collected
    // here and is not ours to return. The prompt is a statutory countdown in
    // red; firing it over a deposit we never held is the same false alarm as
    // calling imported rent "Past due". The wizard is still reachable from the
    // lease itself if the landlord wants the itemization letter.
    if (lease.collections_paused_at) continue
    const deposit = Number(lease.security_deposit)
    if (!Number.isFinite(deposit) || deposit <= 0) continue
    const moveOut = effectiveMoveOutDate(lease, todayIso)
    if (!moveOut || moveOut < from || moveOut > to) continue
    out.push({ lease, moveOut })
  }
  return out.sort((a, b) => (a.moveOut < b.moveOut ? -1 : a.moveOut > b.moveOut ? 1 : 0))
}
