// "Share with renters" — the landlord co-brand panel on manager Settings.
//
// Surfaces the manager's one shareable ?ref=<code> link for the public renter
// tools (Renter Check + Deposit Check). When a renter opens a link, the page
// shows this landlord's company name + logo next to "Powered by Stoop". The
// branding itself is the Profile section above (company_name + logo); here we
// just hand out the links, an optional tagline, and an on/off switch.

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Megaphone, Copy, Check, ExternalLink, Loader2 } from 'lucide-react'
import { ensureReferralPartner, updateReferralPartner } from '@findstoop/shared/api/referralPartners'

interface ToolLink { label: string; path: string; desc: string }

export default function RenterToolsShare({ companyName }: { companyName: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [tagline, setTagline] = useState('')
  const [active, setActive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [savingTagline, setSavingTagline] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ensureReferralPartner()
      .then((row) => {
        if (cancelled) return
        setCode(row.code)
        setTagline(row.tagline ?? '')
        setActive(row.active)
      })
      .catch(() => { /* non-fatal — section just stays empty */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const links: ToolLink[] = [
    { label: 'Renter Check', path: '/renter-check', desc: 'Plain-English lease breakdown' },
    { label: 'Deposit Check', path: '/deposit-check', desc: 'Is this deposit deduction fair?' },
  ]

  const urlFor = (path: string) => `${origin}${path}?ref=${code}`

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1800)
    } catch { toast.error('Could not copy') }
  }

  const saveTagline = async () => {
    if (!code) return
    setSavingTagline(true)
    try {
      await updateReferralPartner(code, { tagline: tagline.trim() || null })
      toast.success('Saved')
    } catch { toast.error('Could not save') } finally { setSavingTagline(false) }
  }

  const toggleActive = async () => {
    if (!code) return
    const next = !active
    setActive(next)
    try { await updateReferralPartner(code, { active: next }) }
    catch { setActive(!next); toast.error('Could not update') }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Megaphone className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">Share with renters</h2>
      </div>

      <p className="text-sm text-mute mb-4">
        Free tools you can hand to applicants and tenants — a lease explainer and a deposit-fairness check.
        Shared with your link, they show <span className="text-ink font-medium">{companyName || 'your company'}</span>{' '}
        next to “Powered by Stoop.”
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-mute text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Preparing your link…</div>
      ) : !code ? (
        <p className="text-sm text-mute">Couldn’t load your share link. Refresh to try again.</p>
      ) : (
        <div className="space-y-4">
          {!companyName && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Add a company name and logo in Profile above so your links are branded.
            </div>
          )}

          {links.map((l) => {
            const url = urlFor(l.path)
            return (
              <div key={l.path} className="border border-gray-200 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{l.label}</p>
                    <p className="text-xs text-mute">{l.desc}</p>
                  </div>
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 shrink-0">
                    Preview <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <input readOnly value={url} onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-mute font-mono" />
                  <button type="button" onClick={() => copy(url)}
                    className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 hover:bg-brand-100 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0">
                    {copied === url ? <><Check className="w-3.5 h-3.5" strokeWidth={2} /> Copied</> : <><Copy className="w-3.5 h-3.5" strokeWidth={1.75} /> Copy</>}
                  </button>
                </div>
              </div>
            )
          })}

          {/* Tagline */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">Tagline (optional)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagline}
                maxLength={120}
                onChange={(e) => setTagline(e.target.value)}
                placeholder={`e.g. A free resource for ${companyName || 'our'} renters.`}
                className="flex-1 min-w-0 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button type="button" onClick={saveTagline} disabled={savingTagline}
                className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50 inline-flex items-center gap-2 shrink-0">
                {savingTagline && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </div>
            <p className="text-xs text-mute mt-1.5">Shown under the page heading when a renter opens your link.</p>
          </div>

          {/* Active toggle */}
          <label className="flex items-center justify-between gap-3 pt-1">
            <span className="text-sm text-ink">Co-branding active</span>
            <button type="button" role="switch" aria-checked={active} onClick={toggleActive}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${active ? 'bg-brand-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${active ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </label>
          {!active && <p className="text-xs text-mute -mt-2">Links still work but show the Stoop brand, not yours.</p>}
        </div>
      )}
    </section>
  )
}
