// Pure decision-support helpers for the screening view. Extracted from
// Screening.tsx so they can be unit-tested. These give the raw Tenability™
// score CONTEXT and read affordability against the widely-used 3x gross
// income-to-rent guideline. Objective signals only — never an approve/deny
// verdict (FCRA / Fair Housing).

export interface ScoreBand { label: string; range: string; tone: string }

export function scoreBand(score: number | null): ScoreBand {
  if (score == null) return { label: 'Not scored yet', range: '', tone: 'text-gray-500' }
  if (score >= 90) return { label: 'Strong', range: '90–100', tone: 'text-emerald-700' }
  if (score >= 70) return { label: 'Moderate', range: '70–89', tone: 'text-blue-700' }
  if (score >= 50) return { label: 'Thin', range: '50–69', tone: 'text-amber-700' }
  return { label: 'Weak', range: '0–49', tone: 'text-red-700' }
}

export interface Affordability { label: string; tone: string }

export function affordability(ratio: number | null): Affordability {
  if (ratio == null) return { label: 'Income not provided', tone: 'text-gray-600 bg-gray-50 border-gray-200' }
  if (ratio >= 3)    return { label: `${ratio.toFixed(1)}× income — at/above the common 3× guideline`, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
  if (ratio >= 2.5)  return { label: `${ratio.toFixed(1)}× income — just under the 3× guideline`, tone: 'text-amber-700 bg-amber-50 border-amber-200' }
  return { label: `${ratio.toFixed(1)}× income — below the 3× guideline`, tone: 'text-red-700 bg-red-50 border-red-200' }
}
