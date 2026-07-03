// Seasonal maintenance autopilot — pure logic + the task content table.
//
// A climate-aware preventive-maintenance schedule per property: which tasks
// matter this season, whether a tenant can safely do them or a pro should,
// and a plain-language "why" (every task protects the asset). The property's
// state gives us a coarse cold-winter vs warm-winter split — coarse on
// purpose: it decides whether to SHOW winterization tasks, nothing safety-
// critical hinges on it.
//
// Persistence ("done / dismissed / asked the tenant" this season) lives in
// seasonal_task_events (migration 20260702000005); this module only computes
// which tasks apply and the occurrence keys used to dedup them.

// ── Content table ────────────────────────────────────────────────────────────

export type TaskClimate = 'all' | 'cold_winter'
/** tenant = safe one-tap delegation; pro = book a vendor, log the expense;
 *  either = tenant-friendly but many landlords hire it out. */
export type TaskWho = 'tenant' | 'pro' | 'either'

export interface SeasonalTask {
  id: string
  title: string
  /** Plain-language why — how the task protects the asset. */
  why: string
  who: TaskWho
  /** Months (1–12) the task is "in season". */
  months: number[]
  climate: TaskClimate
  /** Short cadence label for the UI ("Every 3 months", "Each fall"). */
  cadence: string
  /** Message body used when delegating to the tenant (tenant/either only). */
  tenantAsk?: string
}

export const SEASONAL_TASKS: SeasonalTask[] = [
  {
    id: 'hvac-filter',
    title: 'Replace the furnace / HVAC filter',
    why: 'A clogged filter makes the system work harder, raises energy bills, and shortens the life of the furnace and AC — the single cheapest way to protect the most expensive equipment in the home.',
    who: 'tenant',
    months: [1, 4, 7, 10],
    climate: 'all',
    cadence: 'Every 3 months',
    tenantAsk:
      'Could you swap the furnace/HVAC filter this week? A fresh filter keeps the air cleaner and the heating and cooling working properly. If you need filters or can’t find the filter slot, just reply here and I’ll sort it out.',
  },
  {
    id: 'smoke-co-batteries',
    title: 'Test smoke & CO alarms, replace batteries',
    why: 'Working alarms protect your tenants and your liability. Tying the battery swap to the clock change makes it a habit nobody forgets.',
    who: 'tenant',
    months: [3, 11],
    climate: 'all',
    cadence: 'Twice a year (clock changes)',
    tenantAsk:
      'With the clock change, could you press the test button on each smoke and CO alarm and swap in fresh batteries where needed? If any alarm doesn’t sound or is chirping even with a new battery, let me know right away and I’ll replace it.',
  },
  {
    id: 'gutters-spring',
    title: 'Clear gutters and downspouts (spring)',
    why: 'Spring storms plus winter debris means overflowing gutters, and overflowing gutters mean water against the foundation — the most expensive kind of damage a rental can quietly develop.',
    who: 'either',
    months: [4, 5],
    climate: 'all',
    cadence: 'Each spring',
    tenantAsk:
      'If you’re comfortable on a step ladder, could you check that the gutters and downspouts are clear of leaves and debris? If anything is out of reach or looks damaged, don’t risk it — tell me and I’ll send someone.',
  },
  {
    id: 'gutters-fall',
    title: 'Clear gutters after leaf drop',
    why: 'Leaves left in gutters freeze into ice dams and back water up under the roof. Ten minutes in November saves a roof repair in February.',
    who: 'either',
    months: [10, 11],
    climate: 'all',
    cadence: 'Each fall',
    tenantAsk:
      'Once most of the leaves are down, could you check that the gutters and downspouts are clear? If anything is out of reach or looks damaged, don’t risk it — tell me and I’ll send someone.',
  },
  {
    id: 'ac-service',
    title: 'AC tune-up before summer',
    why: 'A serviced AC runs cheaper and is far less likely to die during the first heat wave — when every HVAC company is booked for weeks and tenants are miserable.',
    who: 'pro',
    months: [4, 5],
    climate: 'all',
    cadence: 'Each spring',
  },
  {
    id: 'heating-service',
    title: 'Heating system service before winter',
    why: 'A furnace that fails in January is an emergency call at emergency prices — and in freezing weather, no heat can become a habitability issue fast. A fall tune-up catches it early.',
    who: 'pro',
    months: [9, 10],
    climate: 'cold_winter',
    cadence: 'Each fall',
  },
  {
    id: 'winterize-exterior',
    title: 'Winterize outdoor faucets and hoses',
    why: 'A hose left connected through the first freeze can burst the pipe inside the wall. Disconnecting hoses and shutting off exterior faucets is five minutes of work against a four-figure repair.',
    who: 'tenant',
    months: [10, 11],
    climate: 'cold_winter',
    cadence: 'Before the first freeze',
    tenantAsk:
      'Before the first freeze, could you disconnect any garden hoses and, if there’s an indoor shut-off for the outdoor faucets, close it and let the faucets drain? It prevents pipes bursting inside the wall. Not sure where the shut-off is? Reply here and I’ll walk you through it.',
  },
  {
    id: 'dryer-vent',
    title: 'Clean the dryer vent',
    why: 'Lint-clogged dryer vents are one of the leading causes of house fires — and they make every load take twice as long, which tenants notice on their electric bill.',
    who: 'either',
    months: [9],
    climate: 'all',
    cadence: 'Once a year',
    tenantAsk:
      'Could you clean out the dryer’s lint duct where the hose meets the wall (not just the lint screen)? It keeps drying times short and removes a real fire risk. If the vent run is long or hard to reach, tell me and I’ll have it professionally cleaned.',
  },
  {
    id: 'water-heater-flush',
    title: 'Flush the water heater',
    why: 'Sediment builds up at the bottom of the tank, eats efficiency, and rusts it out years early. An annual flush is the difference between a 6-year tank and a 12-year tank.',
    who: 'pro',
    months: [6],
    climate: 'all',
    cadence: 'Once a year',
  },
  {
    id: 'exterior-walkthrough',
    title: 'Exterior walkthrough — roof, siding, drainage',
    why: 'A slow leak or grade problem found in spring costs a fraction of what it costs after a year of water getting in. Walk the outside once a year and look up, down, and at the ground.',
    who: 'pro',
    months: [5, 6],
    climate: 'all',
    cadence: 'Once a year',
  },
]

// ── Climate — coarse cold-winter vs warm-winter split by state ───────────────
//
// Warm-winter states where hard freezes are rare enough that winterization
// tasks would be noise. Everything else (including unknown/blank states)
// defaults to cold-winter — the safe direction: showing a freeze-protection
// task in a mild state is harmless; hiding it in a cold one is not.

const WARM_WINTER_STATES = new Set([
  'FL', 'HI', 'CA', 'AZ', 'NV', 'TX', 'LA', 'MS', 'AL', 'GA', 'SC', 'PR',
])

export function isColdWinterState(state: string | null | undefined): boolean {
  const code = (state ?? '').trim().toUpperCase()
  if (!code) return true
  return !WARM_WINTER_STATES.has(code)
}

// ── Applicability ────────────────────────────────────────────────────────────

/** How many months ahead count as "coming up". */
export const UPCOMING_LOOKAHEAD_MONTHS = 2

export interface SeasonalTaskOccurrence {
  task: SeasonalTask
  /** The occurrence month as YYYY-MM (handles the December → January rollover). */
  occurrence: string
  /** 'current' = due this month; 'upcoming' = due within the lookahead. */
  timing: 'current' | 'upcoming'
}

function occurrenceKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Does this task apply to a property in this state at all? */
export function taskAppliesToState(task: SeasonalTask, state: string | null | undefined): boolean {
  if (task.climate === 'cold_winter') return isColdWinterState(state)
  return true
}

/**
 * The seasonal schedule for a property right now: tasks due this month plus
 * tasks coming up within UPCOMING_LOOKAHEAD_MONTHS, each with the occurrence
 * key used to record done/dismissed/asked state. When a task spans several
 * consecutive months (e.g. gutters in Oct–Nov), only its nearest occurrence
 * is returned.
 */
export function seasonalSchedule(
  state: string | null | undefined,
  year: number,
  month: number,
  tasks: SeasonalTask[] = SEASONAL_TASKS,
): SeasonalTaskOccurrence[] {
  const out: SeasonalTaskOccurrence[] = []
  for (const task of tasks) {
    if (!taskAppliesToState(task, state)) continue

    if (task.months.includes(month)) {
      out.push({ task, occurrence: occurrenceKey(year, month), timing: 'current' })
      continue
    }
    for (let ahead = 1; ahead <= UPCOMING_LOOKAHEAD_MONTHS; ahead++) {
      const m0 = month - 1 + ahead
      const futureMonth = (m0 % 12) + 1
      const futureYear = year + Math.floor(m0 / 12)
      if (task.months.includes(futureMonth)) {
        out.push({ task, occurrence: occurrenceKey(futureYear, futureMonth), timing: 'upcoming' })
        break
      }
    }
  }
  // Current tasks first, then upcoming by occurrence date.
  return out.sort((a, b) =>
    a.timing !== b.timing ? (a.timing === 'current' ? -1 : 1)
      : a.occurrence.localeCompare(b.occurrence) || a.task.title.localeCompare(b.task.title))
}

/** Tenant-friendly tasks get the one-tap delegate action. */
export function isTenantFriendly(task: SeasonalTask): boolean {
  return task.who === 'tenant' || task.who === 'either'
}

/** Pro (or either) tasks get the "log it as an expense" link. */
export function isProTask(task: SeasonalTask): boolean {
  return task.who === 'pro' || task.who === 'either'
}

/**
 * The message sent when the manager taps "Ask tenant to do it" — plain,
 * friendly, and self-contained. Brand-neutral by construction.
 */
export function tenantAskMessage(task: SeasonalTask, propertyName: string, unitNumber?: string | null): string {
  const where = unitNumber ? `${propertyName}, Unit ${unitNumber}` : propertyName
  const ask = task.tenantAsk ?? `Could you take care of this seasonal task: ${task.title.toLowerCase()}?`
  return `Hi! Quick seasonal maintenance ask for ${where}: ${task.title}.\n\n${ask}\n\nThanks for helping keep the place in good shape!`
}
