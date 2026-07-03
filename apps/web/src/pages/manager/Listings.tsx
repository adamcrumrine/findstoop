import { useState } from 'react'
import { Megaphone, Sparkles, ShieldCheck, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import FairHousingFindings from '../../components/manager/FairHousingFindings'
import { runFairHousingLint, applyLintSuggestion, LINT_MAX_TEXT_LEN } from '../../lib/fairHousingLint'
import type { LintFinding, LintResult } from '../../lib/fairHousingLint'

// Fair Housing listing checker — paste listing copy written for any site
// (Zillow, Craigslist, Facebook) and get it linted BEFORE it goes out.
// Advisory only: findings explain the risk and offer a neutral rewrite;
// nothing is ever blocked. Lives here because this is where listings will
// be written once publishing ships.
function ListingChecker() {
  const [text, setText] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<LintResult | null>(null)
  // Results are for the text as checked — if it changes, invite a re-check.
  const [checkedText, setCheckedText] = useState('')

  const handleCheck = async () => {
    const t = text.trim()
    if (!t || checking) return
    setChecking(true)
    try {
      const r = await runFairHousingLint(t, 'listing')
      setResult(r)
      setCheckedText(text)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not run the check.')
    } finally {
      setChecking(false)
    }
  }

  const handleUseSuggestion = (finding: LintFinding) => {
    const next = applyLintSuggestion(text, finding)
    if (next == null) {
      toast.error("Couldn't find that phrase in your copy — it may have changed.")
      return
    }
    setText(next)
    setCheckedText(next)
    setResult((prev) => {
      if (!prev) return prev
      const remaining = prev.findings.filter((f) => f !== finding)
      return { clear: remaining.length === 0, findings: remaining }
    })
  }

  const stale = result !== null && text !== checkedText

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6 mt-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">Fair Housing listing check</h2>
          <p className="text-sm text-mute mt-0.5">
            Writing a listing for another site? Paste it here before you post — we'll flag
            phrasing that could raise Fair Housing concerns and suggest neutral rewrites.
          </p>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={LINT_MAX_TEXT_LEN}
        rows={6}
        placeholder={'e.g. "Sunny 2-bed near the park, perfect for young professionals…"'}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 resize-y focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
      />

      <div className="flex items-center justify-between gap-3 mt-3">
        <p className="text-xs text-mute">
          {stale ? 'Copy changed since the last check — run it again.' : 'Checks the copy against Fair Housing advertising guidance.'}
        </p>
        <button
          type="button"
          onClick={handleCheck}
          disabled={!text.trim() || checking}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 shrink-0"
        >
          {checking
            ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
            : <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />}
          {checking ? 'Checking…' : 'Check my listing'}
        </button>
      </div>

      {result && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <FairHousingFindings
            clear={result.clear}
            findings={result.findings}
            onUseSuggestion={handleUseSuggestion}
          />
        </div>
      )}
    </section>
  )
}

export default function Listings() {
  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Listings</h1>
        <p className="text-sm text-mute mt-1">
          Post your vacant units publicly and accept online applications.
        </p>
      </header>

      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <div className="w-14 h-14 mx-auto mb-4 bg-brand-50 rounded-2xl flex items-center justify-center">
          <Megaphone className="w-7 h-7 text-brand-600" strokeWidth={1.75} />
        </div>
        <h2 className="text-lg font-semibold text-ink">Listings coming soon</h2>
        <p className="text-sm text-mute mt-2 max-w-md mx-auto">
          Soon you'll be able to publish a vacant unit to a shareable listing page,
          collect applications, and syndicate to major rental sites — all from here.
        </p>
        <div className="inline-flex items-center gap-1.5 text-xs text-brand-700 font-medium mt-4 bg-brand-50 px-3 py-1.5 rounded-full">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
          In active development
        </div>
      </div>

      <ListingChecker />
    </div>
  )
}
