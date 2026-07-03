// Thin client over the fair-housing-lint edge function.
//
// One shared entry point so every surface (message composer, listing checker)
// lints the same way and shows the same shapes. Advisory only — callers must
// never block sending/publishing on the result.

import { supabase } from './supabase'

export interface LintFinding {
  /** Verbatim phrase from the checked text (used for highlight + replace). */
  quote: string
  /** Plain-English explanation of why the phrase is risky. */
  issue: string
  /** Short label, e.g. "Familial status", "Steering". */
  category: string
  /** Neutral drop-in replacement; empty string = just remove the phrase. */
  suggestion: string
  /** 'warning' = conflicts with federal FHA guidance; 'caution' = borderline. */
  severity: 'warning' | 'caution'
}

export interface LintResult {
  clear: boolean
  findings: LintFinding[]
}

interface LintResponse {
  ok: boolean
  clear?: boolean
  findings?: LintFinding[]
  code?: 'bad_input' | 'too_long' | 'rate_limited' | 'unavailable'
  message?: string
}

export const LINT_MAX_TEXT_LEN = 4000

/** Where "Learn more" points from every lint result. */
export const FAIR_HOUSING_GUIDE_PATH = '/education/fair-housing-act-guide'

export async function runFairHousingLint(
  text: string,
  context: 'listing' | 'message',
): Promise<LintResult> {
  const { data, error } = await supabase.functions.invoke('fair-housing-lint', {
    body: { text, context },
  })
  if (error) throw new Error('Could not run the Fair Housing check. Please try again.')
  const res = data as LintResponse
  if (!res?.ok) {
    throw new Error(res?.message || 'Could not run the Fair Housing check. Please try again.')
  }
  return {
    clear: res.clear === true,
    findings: Array.isArray(res.findings) ? res.findings : [],
  }
}

/**
 * Apply a suggestion to the source text: replaces the first occurrence of the
 * quoted phrase (case-sensitive first, then case-insensitive) with the
 * suggested rewrite. Returns null when the quote can't be located — the
 * caller should leave the text untouched.
 */
export function applyLintSuggestion(text: string, finding: LintFinding): string | null {
  const quote = finding.quote
  if (!quote) return null
  let idx = text.indexOf(quote)
  if (idx === -1) idx = text.toLowerCase().indexOf(quote.toLowerCase())
  if (idx === -1) return null
  let next = text.slice(0, idx) + finding.suggestion + text.slice(idx + quote.length)
  if (!finding.suggestion) {
    // Removing a phrase — tidy the doubled spaces/punctuation gaps it leaves.
    next = next.replace(/[ \t]{2,}/g, ' ').replace(/ ([,.;!?])/g, '$1').trim()
  }
  return next
}
