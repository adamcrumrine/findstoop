// "Try this first" — pre-submit maintenance self-triage.
//
// When the tenant hits Submit on a new maintenance request, the page calls
// fetchSelfTriage() (best-effort, 6s cap) and — if the AI found safe quick
// fixes or a safety warning — renders this card in place of the form:
// likely cause, up to 3 numbered zero-risk steps, then "That fixed it!"
// (dismiss, no ticket created) or "Still broken — submit request" (proceeds
// with the original submission). Any failure or timeout returns null and the
// caller submits directly — this must never gate a ticket.

import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { trackAction } from '../../lib/analytics'
import { Lightbulb, AlertTriangle } from 'lucide-react'
import AiFeedback from '../shared/AiFeedback'

export interface SelfTriageResult {
  likely_cause: string
  self_fixes: { step: string; detail: string }[]
  safety_warning: string | null
  should_submit_anyway: boolean
}

interface SelfTriageResponse {
  ok?: boolean
  triage?: SelfTriageResult
}

// Hard client-side cap: past this we submit directly rather than keep the
// tenant waiting on an optional nicety.
const TIMEOUT_MS = 6000

/**
 * Ask the self-triage edge function for safe quick-fix suggestions.
 * Returns null on ANY failure (error, timeout, rate limit, empty result) —
 * callers treat null as "no suggestions, submit as usual".
 */
export async function fetchSelfTriage(title: string, description: string): Promise<SelfTriageResult | null> {
  try {
    const invoke = supabase.functions.invoke('self-triage', {
      body: { title: title.slice(0, 120), description: description.slice(0, 600) },
    })
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS))
    const res = await Promise.race([invoke, timeout])
    if (!res || res.error) return null
    const data = res.data as SelfTriageResponse
    if (!data?.ok || !data.triage) return null
    return data.triage
  } catch {
    return null
  }
}

export default function SelfTriageCard({
  triage,
  submitting,
  onResolved,
  onSubmit,
}: {
  triage: SelfTriageResult
  submitting: boolean
  onResolved: () => void
  onSubmit: () => void
}) {
  const hasFixes = triage.self_fixes.length > 0

  useEffect(() => {
    trackAction('maintenance_self_triage_shown', {
      fixes: triage.self_fixes.length,
      has_warning: !!triage.safety_warning,
    })
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
          <Lightbulb className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">
            {hasFixes ? 'Before you submit — a quick check might fix this' : 'One thing before you submit'}
          </h3>
          <p className="text-sm text-gray-600 mt-0.5">{triage.likely_cause}</p>
        </div>
      </div>

      {triage.safety_warning && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" strokeWidth={2} />
          <p className="text-sm font-medium text-red-700">{triage.safety_warning}</p>
        </div>
      )}

      {hasFixes && (
        <ol className="space-y-2">
          {triage.self_fixes.map((fix, i) => (
            <li key={i} className="flex items-start gap-3 bg-gray-50 border border-gray-100 rounded-lg p-3">
              <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{fix.step}</p>
                <p className="text-sm text-gray-600 mt-0.5">{fix.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {hasFixes && triage.should_submit_anyway && !triage.safety_warning && (
        <p className="text-xs text-gray-500">
          Even if these help, this may still need your landlord's attention — submitting is always OK.
        </p>
      )}

      {hasFixes && <AiFeedback feature="self-triage" />}

      <div className="flex gap-3 pt-1">
        {hasFixes && (
          <button
            type="button"
            onClick={() => {
              trackAction('maintenance_self_fix_resolved', { fixes: triage.self_fixes.length })
              onResolved()
            }}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            That fixed it!
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            trackAction('maintenance_self_fix_submitted_anyway', { fixes: triage.self_fixes.length })
            onSubmit()
          }}
          disabled={submitting}
          className="flex-1 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Still broken — submit request'}
        </button>
      </div>
    </div>
  )
}
