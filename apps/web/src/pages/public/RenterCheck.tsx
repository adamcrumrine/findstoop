// Renter Check (/renter-check) — public, no-login tenant lease explainer.
//
// A renter uploads any lease PDF and gets a plain-English breakdown of their
// obligations, red flags, and Ohio tenant rights. Top-of-funnel for the
// university channel; co-brandable ("Powered by Stoop"). General information,
// not legal advice.

import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import PoweredByStoop from '../../components/shared/PoweredByStoop'
import { useRenterPartner } from '../../hooks/useRenterPartner'
import { BRAND } from '../../lib/brand'
import type { LeaseAnalysis, ExplainLeaseResponse, RedFlagSeverity } from '@findstoop/shared/types/leaseAnalysis'
import { formatUsd } from '@findstoop/shared/lib/format'
import {
  FileText, Loader2, ShieldCheck, AlertTriangle, ScrollText, HelpCircle,
  Scale, UploadCloud, RotateCcw, Mail, Send, CheckCircle2, Building2,
} from 'lucide-react'

const MAX_MB = 15

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)) }
    r.onerror = () => reject(new Error('Could not read the file'))
    r.readAsDataURL(file)
  })
}

const SEV: Record<RedFlagSeverity, { dot: string; chip: string; label: string }> = {
  high:   { dot: 'bg-red-500',   chip: 'bg-red-100 text-red-700',     label: 'High' },
  medium: { dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-700', label: 'Medium' },
  low:    { dot: 'bg-gray-400',  chip: 'bg-gray-100 text-gray-600',   label: 'Low' },
}

export default function RenterCheck() {
  const [params] = useSearchParams()
  const ref = params.get('ref') // channel attribution (e.g. ?ref=osu or a landlord code)
  const partner = useRenterPartner(ref) // co-brand for a known university or self-serve landlord
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<LeaseAnalysis | null>(null)
  const [fileName, setFileName] = useState('')
  // Funnel (L2)
  const [lead, setLead] = useState<{ id: string; token: string; onPlatform: boolean } | null>(null)
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [inviteSent, setInviteSent] = useState(false)
  const [funnelBusy, setFunnelBusy] = useState<'' | 'email' | 'invite'>('')

  const analyze = async (file: File) => {
    if (file.type !== 'application/pdf') { setError('Please upload a PDF lease.'); setStatus('error'); return }
    if (file.size > MAX_MB * 1024 * 1024) { setError(`That file is over ${MAX_MB}MB — try a smaller PDF.`); setStatus('error'); return }
    setFileName(file.name)
    setStatus('analyzing')
    setError('')
    try {
      const pdf_base64 = await fileToBase64(file)
      const { data, error: invokeErr } = await supabase.functions.invoke('explain-lease', { body: { pdf_base64, ref } })
      if (invokeErr) throw new Error(invokeErr.message)
      const res = data as ExplainLeaseResponse
      if (!res.ok || !res.analysis) throw new Error(res.message || 'Could not analyze the lease.')
      setAnalysis(res.analysis)
      if (res.analysis_id && res.access_token) {
        setLead({ id: res.analysis_id, token: res.access_token, onPlatform: !!res.landlord_on_platform })
      }
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setStatus('error')
    }
  }

  const reset = () => {
    setStatus('idle'); setAnalysis(null); setError(''); setFileName('')
    setLead(null); setEmail(''); setEmailSent(false); setInviteSent(false); setFunnelBusy('')
  }

  const emailMe = async () => {
    if (!lead || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError('Enter a valid email.'); return }
    setFunnelBusy('email'); setError('')
    try {
      const { data, error: e } = await supabase.functions.invoke('renter-lead', {
        body: { analysis_id: lead.id, access_token: lead.token, action: 'email_summary', tenant_email: email },
      })
      if (e) throw new Error(e.message)
      if (!(data as { ok?: boolean })?.ok) throw new Error((data as { message?: string })?.message || 'Could not send.')
      setEmailSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the email.')
    } finally { setFunnelBusy('') }
  }

  const inviteLandlord = async () => {
    if (!lead) return
    setFunnelBusy('invite'); setError('')
    try {
      const { data, error: e } = await supabase.functions.invoke('renter-lead', {
        body: { analysis_id: lead.id, access_token: lead.token, action: 'invite_landlord' },
      })
      if (e) throw new Error(e.message)
      if (!(data as { ok?: boolean })?.ok) throw new Error((data as { message?: string })?.message || 'Could not send.')
      setInviteSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invite.')
    } finally { setFunnelBusy('') }
  }

  const nonOhio = analysis && analysis.state_detected && analysis.state_detected !== 'OH'

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header — leaves room for a partner co-brand on the right */}
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
                <span className="text-[11px] uppercase tracking-wider text-mute hidden sm:inline">Renter Check</span>
                <span className="text-gray-300 hidden sm:inline">·</span>
                <PoweredByStoop />
              </div>
            </>
          ) : (
            <>
              <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-8 w-auto" />
              <span className="text-xs font-semibold uppercase tracking-wider text-mute">Renter Check</span>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8">
        {/* Intro */}
        {status !== 'done' && (
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">Understand your lease before you sign</h1>
            <p className="text-sm text-mute mt-2 max-w-xl mx-auto">
              Upload a lease and we'll explain what you're agreeing to — your obligations, the red flags,
              and your rights as an Ohio tenant. Free, and we don't keep your file.
            </p>
            {partner?.tagline && (
              <p className="text-xs text-brand-700 mt-2 font-medium">{partner.tagline}</p>
            )}
          </div>
        )}

        {/* Upload */}
        {(status === 'idle' || status === 'error') && (
          <div className="max-w-md mx-auto">
            <label className="block">
              <input type="file" accept="application/pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) analyze(f) }} />
              <div className="border-2 border-dashed border-gray-300 rounded-2xl bg-white px-6 py-12 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors">
                <UploadCloud className="w-10 h-10 mx-auto text-brand-500 mb-3" strokeWidth={1.5} />
                <p className="text-sm font-semibold text-ink">Choose your lease PDF</p>
                <p className="text-xs text-mute mt-1">PDF up to {MAX_MB}MB</p>
              </div>
            </label>
            {status === 'error' && (
              <p className="text-sm text-red-600 mt-3 text-center">{error}</p>
            )}
          </div>
        )}

        {/* Analyzing */}
        {status === 'analyzing' && (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-brand-600" strokeWidth={1.75} />
            <p className="text-sm text-mute mt-3">Reading {fileName || 'your lease'}…</p>
            <p className="text-xs text-mute mt-1">This takes about 30 seconds.</p>
          </div>
        )}

        {/* Result */}
        {status === 'done' && analysis && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-ink">Here's your lease, in plain English</h1>
              <button onClick={reset} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
                <RotateCcw className="w-4 h-4" strokeWidth={1.75} /> Check another
              </button>
            </div>

            {/* Disclaimer */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
              <Scale className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" strokeWidth={1.75} />
              <p className="text-sm text-amber-900">
                This is general information, not legal advice — we won't tell you whether to sign.
                {nonOhio
                  ? ` This looks like a ${analysis.state_detected} lease; our rights guidance is Ohio-specific, so double-check your state.`
                  : <> For the full picture, see your <Link to="/legal/ohio-tenant-rights" className="font-semibold underline">Ohio tenant rights</Link>.</>}
              </p>
            </div>

            {/* Summary */}
            <Section icon={ScrollText} title="The short version">
              <p className="text-sm text-ink leading-relaxed">{analysis.summary}</p>
            </Section>

            {/* Money + dates */}
            <Section icon={FileText} title="Money & dates">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label="Monthly rent" value={analysis.money.monthly_rent != null ? formatUsd(analysis.money.monthly_rent) : '—'} />
                <Stat label="Deposit" value={analysis.money.deposit != null ? formatUsd(analysis.money.deposit) : '—'} />
                <Stat label="Due upfront" value={analysis.money.total_upfront != null ? formatUsd(analysis.money.total_upfront) : '—'} />
                <Stat label="Term" value={analysis.key_dates.start && analysis.key_dates.end ? `${analysis.key_dates.start} → ${analysis.key_dates.end}` : '—'} />
              </div>
              {analysis.money.other_fees.length > 0 && (
                <ul className="mt-3 text-sm text-mute space-y-1">
                  {analysis.money.other_fees.map((f, i) => (
                    <li key={i} className="flex justify-between border-b border-gray-50 py-1">
                      <span>{f.label}</span><span className="text-ink">{f.amount != null ? formatUsd(f.amount) : '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Red flags */}
            {analysis.red_flags.length > 0 && (
              <Section icon={AlertTriangle} title={`Red flags (${analysis.red_flags.length})`}>
                <div className="space-y-3">
                  {analysis.red_flags
                    .slice()
                    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
                    .map((f, i) => (
                      <div key={i} className="border border-gray-100 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2 h-2 rounded-full ${SEV[f.severity].dot}`} />
                          <p className="text-sm font-semibold text-ink flex-1">{f.issue}</p>
                          <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${SEV[f.severity].chip}`}>{SEV[f.severity].label}</span>
                        </div>
                        <p className="text-sm text-mute">{f.why_it_matters}</p>
                        {(f.state_context || f.statute_cite) && (
                          <p className="text-xs text-mute mt-1.5">
                            {f.state_context}{f.statute_cite ? <span className="font-medium text-ink"> · {f.statute_cite}</span> : null}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </Section>
            )}

            {/* Obligations */}
            {analysis.obligations.length > 0 && (
              <Section icon={ScrollText} title="What you're agreeing to">
                <ul className="space-y-2.5">
                  {analysis.obligations.map((o, i) => (
                    <li key={i}>
                      <p className="text-sm font-medium text-ink">{o.title}</p>
                      <p className="text-sm text-mute">{o.plain_english}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Rights */}
            {analysis.your_rights.length > 0 && (
              <Section icon={ShieldCheck} title="Your rights (whatever the lease says)">
                <ul className="space-y-2.5">
                  {analysis.your_rights.map((r, i) => (
                    <li key={i}>
                      <p className="text-sm font-medium text-ink">{r.right}{r.statute_cite ? <span className="text-mute font-normal"> · {r.statute_cite}</span> : null}</p>
                      <p className="text-sm text-mute">{r.plain_english}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Questions */}
            {analysis.questions_to_ask.length > 0 && (
              <Section icon={HelpCircle} title="Ask before you sign">
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink">
                  {analysis.questions_to_ask.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </Section>
            )}

            {/* Funnel: keep a copy + landlord */}
            {lead && (
              <div className="grid sm:grid-cols-2 gap-4 pt-1">
                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-ink mb-2">
                    <Mail className="w-4 h-4 text-brand-600" strokeWidth={1.75} /> Keep a copy
                  </h2>
                  {emailSent ? (
                    <p className="text-sm text-green-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" strokeWidth={1.75} /> Sent — check your inbox.</p>
                  ) : (
                    <>
                      <p className="text-sm text-mute mb-2">We'll email you this summary. We don't keep your lease file.</p>
                      <div className="flex gap-2">
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        <button onClick={emailMe} disabled={funnelBusy === 'email'}
                          className="bg-brand-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                          {funnelBusy === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" strokeWidth={1.75} />}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-ink mb-2">
                    <Building2 className="w-4 h-4 text-brand-600" strokeWidth={1.75} /> Your landlord
                  </h2>
                  {lead.onPlatform ? (
                    <p className="text-sm text-ink">
                      Good news — your landlord already uses {BRAND.name}, so you can pay rent and handle documents in one place.{' '}
                      <Link to="/login/renter" className="text-brand-600 font-medium underline">Renter sign in</Link>
                    </p>
                  ) : analysis.parties.landlord_email ? (
                    inviteSent ? (
                      <p className="text-sm text-green-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" strokeWidth={1.75} /> We let {analysis.parties.landlord_name || 'your landlord'} know.</p>
                    ) : (
                      <>
                        <p className="text-sm text-mute mb-2">Want your landlord handling renewals, deposits, and notices more professionally? Invite them.</p>
                        <button onClick={inviteLandlord} disabled={funnelBusy === 'invite'}
                          className="inline-flex items-center gap-1.5 border border-brand-300 text-brand-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-brand-50 disabled:opacity-50">
                          {funnelBusy === 'invite' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" strokeWidth={1.75} />}
                          Invite {analysis.parties.landlord_name || 'your landlord'}
                        </button>
                      </>
                    )
                  ) : (
                    <p className="text-sm text-mute">Know a landlord who'd use a tool like this? Point them to <span className="text-brand-600 font-medium">{BRAND.domain}/renter-check</span>.</p>
                  )}
                </div>
                {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
              </div>
            )}
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

function sevRank(s: RedFlagSeverity) { return s === 'high' ? 3 : s === 'medium' ? 2 : 1 }

function Section({ icon: Icon, title, children }: { icon: typeof FileText; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink mb-3">
        <Icon className="w-4 h-4 text-brand-600" strokeWidth={1.75} /> {title}
      </h2>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-mute">{label}</p>
      <p className="text-sm font-semibold text-ink mt-0.5">{value}</p>
    </div>
  )
}
