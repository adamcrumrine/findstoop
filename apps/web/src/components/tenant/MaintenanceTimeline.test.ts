import { describe, it, expect } from 'vitest'
import { timelineSteps } from './MaintenanceTimeline'

const base = {
  created_at: '2026-07-01T10:00:00Z',
  in_progress_at: null as string | null,
  resolved_at: null as string | null,
}

describe('timelineSteps', () => {
  it('open request: received is current, rest pending', () => {
    const steps = timelineSteps({ ...base, status: 'open' })
    expect(steps.map((s) => s.state)).toEqual(['current', 'pending', 'pending'])
    expect(steps[0].at).toBe(base.created_at)
  })

  it('in_progress: received done, in-progress current with its stamp', () => {
    const steps = timelineSteps({ ...base, status: 'in_progress', in_progress_at: '2026-07-02T09:00:00Z' })
    expect(steps.map((s) => s.state)).toEqual(['done', 'current', 'pending'])
    expect(steps[1].at).toBe('2026-07-02T09:00:00Z')
  })

  it('legacy in_progress rows (no stamp) still show the step as current, dateless', () => {
    const steps = timelineSteps({ ...base, status: 'in_progress' })
    expect(steps[1].state).toBe('current')
    expect(steps[1].at).toBeNull()
  })

  it('resolved: all done, resolved shows its timestamp', () => {
    const steps = timelineSteps({ ...base, status: 'resolved', in_progress_at: '2026-07-02T09:00:00Z', resolved_at: '2026-07-03T15:00:00Z' })
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done'])
    expect(steps[2].at).toBe('2026-07-03T15:00:00Z')
    expect(steps[2].label).toBe('Resolved')
  })

  it('closed reads as Closed and completes the track', () => {
    const steps = timelineSteps({ ...base, status: 'closed' })
    expect(steps[2].label).toBe('Closed')
    expect(steps[2].state).toBe('done')
  })

  it('resolved straight from open (skipped in_progress) still completes every stop', () => {
    const steps = timelineSteps({ ...base, status: 'resolved', resolved_at: '2026-07-03T15:00:00Z' })
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done'])
    expect(steps[1].at).toBeNull()
  })
})
