// Fair Housing lint results — shared renderer for the message composer and
// the listing checker. Advisory tone throughout: we flag and explain, never
// accuse, and the landlord always stays in control of what goes out.

import { ShieldCheck, AlertTriangle, Info, ExternalLink } from 'lucide-react'
import AiFeedback from '../shared/AiFeedback'
import type { LintFinding } from '../../lib/fairHousingLint'
import { FAIR_HOUSING_GUIDE_PATH } from '../../lib/fairHousingLint'

export default function FairHousingFindings({
  clear,
  findings,
  onUseSuggestion,
}: {
  clear: boolean
  findings: LintFinding[]
  /** When provided, each finding with a locatable quote gets a one-tap fix. */
  onUseSuggestion?: (finding: LintFinding) => void
}) {
  if (clear || findings.length === 0) {
    return (
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">No fair-housing concerns found</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Automated check to help you stay compliant — not a legal review.{' '}
            <GuideLink />
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {findings.map((f, i) => {
        const isWarning = f.severity === 'warning'
        return (
          <div key={i} className="flex items-start gap-2.5">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                isWarning ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {isWarning
                ? <AlertTriangle className="w-4 h-4" strokeWidth={1.75} />
                : <Info className="w-4 h-4" strokeWidth={1.75} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-gray-900">&ldquo;{f.quote}&rdquo;</p>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    isWarning ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {f.category}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">{f.issue}</p>
              {(f.suggestion || onUseSuggestion) && (
                <div className="mt-1.5 flex items-start gap-2 flex-wrap">
                  {f.suggestion ? (
                    <p className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
                      Try: <span className="font-medium">&ldquo;{f.suggestion}&rdquo;</span>
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 italic">Suggested fix: remove this phrase.</p>
                  )}
                  {onUseSuggestion && (
                    <button
                      type="button"
                      onClick={() => onUseSuggestion(f)}
                      className="text-xs font-semibold text-brand-700 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 rounded-lg px-2.5 py-1.5 transition-colors"
                    >
                      {f.suggestion ? 'Use suggestion' : 'Remove phrase'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
      <p className="text-[11px] text-gray-400">
        Flagged for your review — you decide what to send. This is automated guidance, not a legal review.{' '}
        <GuideLink />
      </p>
      <AiFeedback feature="fair-housing-lint" />
    </div>
  )
}

function GuideLink() {
  return (
    <a
      href={FAIR_HOUSING_GUIDE_PATH}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-brand-600 hover:text-brand-700 font-medium"
    >
      Learn more
      <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
    </a>
  )
}
