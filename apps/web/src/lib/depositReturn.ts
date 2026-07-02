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
  statuteCite: string
  /** The statute requires an itemized list of deductions. */
  requiresItemization: boolean
  /** The return clock is tied to the tenant providing a forwarding address. */
  forwardingAddressMatters: boolean
  /** Plain-fact line about ordinary wear and tear. */
  wearAndTearNote: string
  /** What missing the deadline / wrongful withholding exposes the landlord to. */
  penaltyNote: string
}

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
  return addDaysIso(moveOutIso, rule.deadlineDays)
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
    const deposit = Number(lease.security_deposit)
    if (!Number.isFinite(deposit) || deposit <= 0) continue
    const moveOut = effectiveMoveOutDate(lease, todayIso)
    if (!moveOut || moveOut < from || moveOut > to) continue
    out.push({ lease, moveOut })
  }
  return out.sort((a, b) => (a.moveOut < b.moveOut ? -1 : a.moveOut > b.moveOut ? 1 : 0))
}
