// Deposit Check (/deposit-check) — public, no-login tenant tool.
//
// A renter uploads or pastes the landlord's security-deposit disposition letter
// and gets each deduction judged fair / questionable / unfair against Ohio law,
// with the total they may be owed back — then hands off to the demand letter.
// General information, not legal advice.

import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import PoweredByStoop from '../../components/shared/PoweredByStoop'
import { useRenterPartner } from '../../hooks/useRenterPartner'
import { BRAND } from '../../lib/brand'
import type { DepositCheckResult, CheckDepositResponse, DeductionVerdict } from '@findstoop/shared/types/depositCheck'
import { formatUsd } from '@findstoop/shared/lib/format'
import { Loader2, UploadCloud, Scale, RotateCcw, CheckCircle2, AlertTriangle, XCircle, Banknote, ArrowRight } from 'lucide-react'

const MAX_MB = 15

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)) }
    r.onerror = () => reject(new Error('Could not read the file'))
    r.readAsDataURL(file)
  })
}

const VERDICT: Record<DeductionVerdict, { Icon: typeof CheckCircle2; chip: string; label: string }> = {
  fair:         { Icon: CheckCircle2,  chip: 'bg-green-100 text-green-700', label: 'Likely fair' },
  questionable: { Icon: AlertTriangle, chip: 'bg-amber-100 text-amber-700', label: 'Questionable' },
  unfair:       { Icon: XCircle,       chip: 'bg-red-100 text-red-700',     label: 'Likely unfair' },
}

export default function DepositCheck() {
  const [params] = useSearchParams()
  const ref = params.get('ref')
  const partner = useRenterPartner(ref) // co-brand for a university or self-serve landlord
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [analysis, setAnalysis] = useState<DepositCheckResult | null>(null)

  const run = async (payload: { pdf_base64?: string; text?: string }) => {
    setStatus('analyzing'); setError('')
    try {
      const { data, error: e } = await supabase.functions.invoke('check-deposit', { body: { ...payload, ref } })
      if (e) throw new Error(e.message)
      const res = data as CheckDepositResponse
      if (!res.ok || !res.analysis) throw new Error(res.message || 'Could not analyze the deductions.')
      setAnalysis(res.analysis)
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error')
    }
  }

  const onFile = async (file: File) => {
    if (file.type !== 'application/pdf') { setError('Please upload a PDF.'); setStatus('error'); return }
    if (file.size > MAX_MB * 1024 * 1024) { setError(`That file is over ${MAX_MB}MB.`); setStatus('error'); return }
    run({ pdf_base64: await fileToBase64(file) })
  }

  const reset = () => { setStatus('idle'); setAnalysis(null); setError(''); setText('') }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          {partner ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                {partner.logoUrl
                  ? <img src={partner.logoUrl} alt={partner.name} className="h-8 w-auto" />
                  : <span className="font-semibold text-ink text-sm truncate">{partner.name}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] uppercase tracking-wider text-mute hidden sm:inline">Deposit Check</span>
                <span className="text-gray-300 hidden sm:inline">·</span>
                <PoweredByStoop />
              </div>
            </>
          ) : (
            <>
              <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-8 w-auto" />
              <span className="text-xs font-semibold uppercase tracking-wider text-mute">Deposit Check</span>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8">
        {status !== 'done' && (
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">Did your landlord keep too much of your deposit?</h1>
            <p className="text-sm text-mute mt-2 max-w-xl mx-auto">
              Paste or upload the deduction letter your landlord sent. We'll check each charge against
              your Ohio rights and tell you what looks unfair — and what you may be owed back.
            </p>
            {partner?.tagline && <p className="text-xs text-brand-700 mt-2 font-medium">{partner.tagline}</p>}
          </div>
        )}

        {(status === 'idle' || status === 'error') && (
          <div className="max-w-xl mx-auto space-y-4">
            <textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the itemized deductions here — e.g. 'Carpet cleaning $150, repaint $300, $200 kept for normal wear…'"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => text.trim() && run({ text: text.trim() })}
                disabled={!text.trim()}
                className="flex-1 bg-brand-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-40"
              >
                Check these deductions
              </button>
              <label className="flex-1">
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
                <div className="cursor-pointer border-2 border-dashed border-gray-300 rounded-lg px-4 py-2.5 text-center text-sm text-mute hover:border-brand-400 hover:text-brand-600 inline-flex items-center justify-center gap-2 w-full">
                  <UploadCloud className="w-4 h-4" strokeWidth={1.75} /> or upload the PDF letter
                </div>
              </label>
            </div>
            {status === 'error' && <p className="text-sm text-red-600 text-center">{error}</p>}
          </div>
        )}

        {status === 'analyzing' && (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-brand-600" strokeWidth={1.75} />
            <p className="text-sm text-mute mt-3">Checking the deductions…</p>
          </div>
        )}

        {status === 'done' && analysis && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-ink">Here's how the deductions hold up</h1>
              <button onClick={reset} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
                <RotateCcw className="w-4 h-4" strokeWidth={1.75} /> Check another
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
              <Scale className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" strokeWidth={1.75} />
              <p className="text-sm text-amber-900">General information, not legal advice — and we don't keep your file.</p>
            </div>

            {/* Headline numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Deposit" value={analysis.deposit_amount != null ? formatUsd(analysis.deposit_amount) : '—'} />
              <Stat label="Deducted" value={analysis.total_deducted != null ? formatUsd(analysis.total_deducted) : '—'} />
              <Stat label="Returned" value={analysis.amount_returned != null ? formatUsd(analysis.amount_returned) : '—'} />
              <Stat label="You may be owed" value={analysis.likely_owed_back != null ? formatUsd(analysis.likely_owed_back) : '—'} highlight />
            </div>

            <Section title="The short version">
              <p className="text-sm text-ink leading-relaxed">{analysis.summary}</p>
              {analysis.within_30_days === false && (
                <p className="text-sm text-red-700 mt-2">⚠ This looks like it came more than 30 days after move-out — Ohio law (ORC 5321.16) requires the itemized return within 30 days.</p>
              )}
              {analysis.itemized === false && (
                <p className="text-sm text-red-700 mt-2">⚠ The deductions don't appear itemized — Ohio law requires an itemized list.</p>
              )}
            </Section>

            <Section title={`Each deduction (${analysis.deductions.length})`}>
              <div className="space-y-2.5">
                {analysis.deductions.map((d, i) => {
                  const v = VERDICT[d.verdict] ?? VERDICT.questionable
                  return (
                    <div key={i} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <v.Icon className={`w-4 h-4 shrink-0 ${d.verdict === 'fair' ? 'text-green-600' : d.verdict === 'unfair' ? 'text-red-600' : 'text-amber-600'}`} strokeWidth={1.75} />
                        <p className="text-sm font-semibold text-ink flex-1">{d.label}</p>
                        {d.amount != null && <span className="text-sm font-semibold text-ink">{formatUsd(d.amount)}</span>}
                        <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${v.chip}`}>{v.label}</span>
                      </div>
                      <p className="text-sm text-mute mt-1">{d.why}</p>
                      {d.statute_cite && <p className="text-xs text-mute mt-1 font-medium">{d.statute_cite}</p>}
                    </div>
                  )
                })}
              </div>
            </Section>

            {analysis.your_rights.length > 0 && (
              <Section title="Your rights">
                <ul className="space-y-2">
                  {analysis.your_rights.map((r, i) => (
                    <li key={i}>
                      <p className="text-sm font-medium text-ink">{r.right}{r.statute_cite ? <span className="text-mute font-normal"> · {r.statute_cite}</span> : null}</p>
                      <p className="text-sm text-mute">{r.plain_english}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Hand off to the demand letter */}
            <Link
              to={`/deposit-demand${analysis.likely_owed_back ? `?owed=${analysis.likely_owed_back}` : ''}`}
              className="flex items-center gap-3 bg-brand-600 text-white rounded-2xl px-5 py-4 hover:bg-brand-700 transition-colors"
            >
              <Banknote className="w-6 h-6 shrink-0" strokeWidth={1.75} />
              <div className="flex-1">
                <p className="font-semibold">Build your demand letter</p>
                <p className="text-sm text-white/80">A print-ready letter asking for {analysis.likely_owed_back ? formatUsd(analysis.likely_owed_back) : 'your deposit'} back, citing your Ohio rights.</p>
              </div>
              <ArrowRight className="w-5 h-5 shrink-0" strokeWidth={2} />
            </Link>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <PoweredByStoop />
          <p className="text-xs text-mute">General information, not legal advice.</p>
        </div>
      </footer>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4">
      <h2 className="text-sm font-semibold text-ink mb-3">{title}</h2>
      {children}
    </section>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? 'bg-brand-50 border border-brand-200' : 'bg-gray-50'}`}>
      <p className="text-[10px] uppercase tracking-wide text-mute">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${highlight ? 'text-brand-700' : 'text-ink'}`}>{value}</p>
    </div>
  )
}
