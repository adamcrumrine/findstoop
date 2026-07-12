// Package-tracking timeline for a maintenance request — the tenant's answer
// to "did they even see it?". Three stops: received → in progress → resolved,
// derived from status + the trigger-stamped timestamps. Legacy rows (before
// in_progress_at existed) show completed steps without a date rather than a
// made-up one.

import type { MaintenanceRequest } from '@findstoop/shared/types/maintenance'
import { Check, Hammer, Inbox, PartyPopper } from 'lucide-react'

export interface TimelineStep {
  key: 'received' | 'in_progress' | 'resolved'
  label: string
  sublabel: string
  /** ISO timestamp when known; completed steps may legitimately lack one. */
  at: string | null
  state: 'done' | 'current' | 'pending'
}

/** Pure derivation so it's testable without rendering. */
export function timelineSteps(req: Pick<MaintenanceRequest, 'status' | 'created_at' | 'in_progress_at' | 'resolved_at'>): TimelineStep[] {
  const started = req.status !== 'open'
  const finished = req.status === 'resolved' || req.status === 'closed'
  return [
    {
      key: 'received',
      label: 'Request received',
      sublabel: 'Your landlord was notified right away',
      at: req.created_at,
      state: started ? 'done' : 'current',
    },
    {
      key: 'in_progress',
      label: 'In progress',
      sublabel: 'Your landlord is working on it',
      at: req.in_progress_at,
      state: finished ? 'done' : started ? 'current' : 'pending',
    },
    {
      key: 'resolved',
      label: req.status === 'closed' ? 'Closed' : 'Resolved',
      sublabel: 'All done',
      at: req.resolved_at,
      state: finished ? 'done' : 'pending',
    },
  ]
}

const STEP_ICON = { received: Inbox, in_progress: Hammer, resolved: PartyPopper } as const

function fmt(at: string): string {
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function MaintenanceTimeline({ request }: { request: MaintenanceRequest }) {
  const steps = timelineSteps(request)
  return (
    <ol aria-label="Request progress" className="relative">
      {steps.map((step, i) => {
        const Icon = STEP_ICON[step.key]
        const isLast = i === steps.length - 1
        return (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
            {/* Connector line to the next stop. */}
            {!isLast && (
              <span
                aria-hidden="true"
                className={`absolute left-[15px] top-8 bottom-0 w-0.5 rounded ${
                  step.state === 'done' ? 'bg-brand-400' : 'bg-gray-200'
                }`}
              />
            )}
            <span
              className={`relative z-10 w-8 h-8 rounded-full inline-flex items-center justify-center shrink-0 ${
                step.state === 'done'
                  ? 'bg-brand-600 text-white'
                  : step.state === 'current'
                    ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-500'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {step.state === 'done' ? <Check className="w-4 h-4" strokeWidth={2.5} /> : <Icon className="w-4 h-4" strokeWidth={1.75} />}
            </span>
            <div className="min-w-0 pt-1">
              <p className={`text-sm font-semibold leading-tight ${step.state === 'pending' ? 'text-gray-400' : 'text-ink'}`}>
                {step.label}
              </p>
              {step.state !== 'pending' && (
                <p className="text-xs text-mute mt-0.5">
                  {step.at ? fmt(step.at) : step.state === 'current' ? step.sublabel : ''}
                  {step.at && step.state === 'current' ? ` — ${step.sublabel}` : ''}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
