import { describe, it, expect } from 'vitest'
import {
  SEASONAL_TASKS, seasonalSchedule, taskAppliesToState, isColdWinterState,
  isTenantFriendly, isProTask, tenantAskMessage, UPCOMING_LOOKAHEAD_MONTHS,
  type SeasonalTask,
} from './seasonalMaintenance'

const byId = (id: string): SeasonalTask => {
  const t = SEASONAL_TASKS.find((x) => x.id === id)
  if (!t) throw new Error(`missing task ${id}`)
  return t
}

describe('content table sanity', () => {
  it('every task has months in range and non-empty copy', () => {
    for (const t of SEASONAL_TASKS) {
      expect(t.months.length).toBeGreaterThan(0)
      for (const m of t.months) {
        expect(m).toBeGreaterThanOrEqual(1)
        expect(m).toBeLessThanOrEqual(12)
      }
      expect(t.title.length).toBeGreaterThan(0)
      expect(t.why.length).toBeGreaterThan(20)
      expect(t.cadence.length).toBeGreaterThan(0)
    }
  })

  it('tenant-delegable tasks carry a tenant ask message', () => {
    for (const t of SEASONAL_TASKS.filter(isTenantFriendly)) {
      expect(t.tenantAsk, `${t.id} needs tenantAsk copy`).toBeTruthy()
    }
  })
})

describe('isColdWinterState / taskAppliesToState', () => {
  it('splits cold-winter from warm-winter states coarsely', () => {
    expect(isColdWinterState('OH')).toBe(true)
    expect(isColdWinterState('mn')).toBe(true)
    expect(isColdWinterState('FL')).toBe(false)
    expect(isColdWinterState('az')).toBe(false)
  })

  it('defaults unknown or blank states to cold-winter (the safe direction)', () => {
    expect(isColdWinterState('')).toBe(true)
    expect(isColdWinterState(null)).toBe(true)
    expect(isColdWinterState('ZZ')).toBe(true)
  })

  it('hides winterization in warm-winter states, keeps all-climate tasks', () => {
    const winterize = byId('winterize-exterior')
    expect(taskAppliesToState(winterize, 'FL')).toBe(false)
    expect(taskAppliesToState(winterize, 'OH')).toBe(true)
    expect(taskAppliesToState(byId('hvac-filter'), 'FL')).toBe(true)
  })
})

describe('seasonalSchedule', () => {
  it('returns current-month tasks with a current-month occurrence key', () => {
    // October in Ohio: filter quarter, both fall tasks, heating service, winterize.
    const s = seasonalSchedule('OH', 2026, 10)
    const current = s.filter((x) => x.timing === 'current').map((x) => x.task.id)
    expect(current).toContain('hvac-filter')
    expect(current).toContain('gutters-fall')
    expect(current).toContain('heating-service')
    expect(current).toContain('winterize-exterior')
    const filter = s.find((x) => x.task.id === 'hvac-filter')
    expect(filter?.occurrence).toBe('2026-10')
  })

  it('surfaces upcoming tasks within the lookahead, nearest occurrence only', () => {
    // September in Ohio: dryer vent + heating are current; October brings
    // hvac-filter/gutters/winterize as upcoming.
    const s = seasonalSchedule('OH', 2026, 9)
    const upcoming = s.filter((x) => x.timing === 'upcoming')
    const ids = upcoming.map((x) => x.task.id)
    expect(ids).toContain('hvac-filter')
    expect(ids).toContain('winterize-exterior')
    expect(upcoming.find((x) => x.task.id === 'hvac-filter')?.occurrence).toBe('2026-10')
    // smoke-co (Mar/Nov) lands at its November occurrence, two months out.
    expect(upcoming.find((x) => x.task.id === 'smoke-co-batteries')?.occurrence).toBe('2026-11')
    // gutters-fall spans Oct+Nov but appears once, at its nearest month.
    expect(ids.filter((i) => i === 'gutters-fall')).toHaveLength(1)
    expect(upcoming.find((x) => x.task.id === 'gutters-fall')?.occurrence).toBe('2026-10')
  })

  it('rolls the occurrence year over December → January', () => {
    const s = seasonalSchedule('OH', 2026, 12)
    const filter = s.find((x) => x.task.id === 'hvac-filter')
    expect(filter?.timing).toBe('upcoming')
    expect(filter?.occurrence).toBe('2027-01')
  })

  it('omits cold-winter tasks for warm-winter states', () => {
    const s = seasonalSchedule('FL', 2026, 10)
    const ids = s.map((x) => x.task.id)
    expect(ids).not.toContain('winterize-exterior')
    expect(ids).not.toContain('heating-service')
    expect(ids).toContain('gutters-fall')
  })

  it('sorts current before upcoming', () => {
    const s = seasonalSchedule('OH', 2026, 9)
    const firstUpcoming = s.findIndex((x) => x.timing === 'upcoming')
    const lastCurrent = s.map((x) => x.timing).lastIndexOf('current')
    expect(firstUpcoming === -1 || lastCurrent < firstUpcoming).toBe(true)
  })

  it('lookahead constant is what the UI copy assumes', () => {
    expect(UPCOMING_LOOKAHEAD_MONTHS).toBe(2)
  })
})

describe('who-can-do-it helpers', () => {
  it('classifies tenant / pro / either correctly', () => {
    expect(isTenantFriendly(byId('hvac-filter'))).toBe(true)
    expect(isProTask(byId('hvac-filter'))).toBe(false)
    expect(isTenantFriendly(byId('heating-service'))).toBe(false)
    expect(isProTask(byId('heating-service'))).toBe(true)
    expect(isTenantFriendly(byId('gutters-fall'))).toBe(true)
    expect(isProTask(byId('gutters-fall'))).toBe(true)
  })
})

describe('tenantAskMessage', () => {
  it('names the property and unit and includes the task ask', () => {
    const msg = tenantAskMessage(byId('hvac-filter'), 'Maple Duplex', '2')
    expect(msg).toContain('Maple Duplex, Unit 2')
    expect(msg).toContain('Replace the furnace / HVAC filter')
    expect(msg).toContain('filter')
  })

  it('omits the unit when there is none', () => {
    const msg = tenantAskMessage(byId('smoke-co-batteries'), 'Maple House', null)
    expect(msg).toContain('Maple House:')
    expect(msg).not.toContain('Unit')
  })
})
