// Seasonal maintenance schedule — Deno mirror of the web content table.
//
// MIRROR of apps/web/src/lib/seasonalMaintenance.ts (same tradeoff as
// _shared/leaseTemplates.ts): edge functions can't import from apps/web, so
// the cron carries a copy of the pure logic it needs. If you change the task
// table or the schedule rules there, change them here too. Only the pieces
// the reminder cron needs are mirrored (no tenantAsk copy, no delegation).

export type TaskWho = 'tenant' | 'pro' | 'either'

export interface SeasonalTask {
  id: string
  title: string
  who: TaskWho
  months: number[]
  climate: 'all' | 'cold_winter'
}

export const SEASONAL_TASKS: SeasonalTask[] = [
  { id: 'hvac-filter',          title: 'Replace the furnace / HVAC filter',          who: 'tenant', months: [1, 4, 7, 10], climate: 'all' },
  { id: 'smoke-co-batteries',   title: 'Test smoke & CO alarms, replace batteries',  who: 'tenant', months: [3, 11],       climate: 'all' },
  { id: 'gutters-spring',       title: 'Clear gutters and downspouts (spring)',      who: 'either', months: [4, 5],        climate: 'all' },
  { id: 'gutters-fall',         title: 'Clear gutters after leaf drop',              who: 'either', months: [10, 11],      climate: 'all' },
  { id: 'ac-service',           title: 'AC tune-up before summer',                   who: 'pro',    months: [4, 5],        climate: 'all' },
  { id: 'heating-service',      title: 'Heating system service before winter',       who: 'pro',    months: [9, 10],       climate: 'cold_winter' },
  { id: 'winterize-exterior',   title: 'Winterize outdoor faucets and hoses',        who: 'tenant', months: [10, 11],      climate: 'cold_winter' },
  { id: 'dryer-vent',           title: 'Clean the dryer vent',                       who: 'either', months: [9],           climate: 'all' },
  { id: 'water-heater-flush',   title: 'Flush the water heater',                     who: 'pro',    months: [6],           climate: 'all' },
  { id: 'exterior-walkthrough', title: 'Exterior walkthrough — roof, siding, drainage', who: 'pro', months: [5, 6],        climate: 'all' },
]

const WARM_WINTER_STATES = new Set([
  'FL', 'HI', 'CA', 'AZ', 'NV', 'TX', 'LA', 'MS', 'AL', 'GA', 'SC', 'PR',
])

export function isColdWinterState(state: string | null | undefined): boolean {
  const code = (state ?? '').trim().toUpperCase()
  if (!code) return true
  return !WARM_WINTER_STATES.has(code)
}

/** Tasks due in this calendar month for a property in this state. */
export function tasksDueThisMonth(state: string | null | undefined, month: number): SeasonalTask[] {
  return SEASONAL_TASKS.filter((t) =>
    t.months.includes(month) && (t.climate !== 'cold_winter' || isColdWinterState(state)),
  )
}

/** Occurrence key matching the web app / seasonal_task_events ('2026-10'). */
export function occurrenceKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}
