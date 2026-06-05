// Eviction Prep packet (/manager/documents/eviction-prep/:leaseId).
//
// NOT a legal document — an organizational tool. Pulls together the case
// timeline, a checklist of what a court/attorney will ask for (with ✓ for
// what's on file), and download links for the evidence. Ohio next-steps and a
// prominent "this isn't legal advice" disclaimer.

import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getLeaseDocContext, listGeneratedDocumentsForLease, type LeaseDocBundle } from '@findstoop/shared/api/generatedDocuments'
import { getPaymentsByLeaseIds } from '@findstoop/shared/api/payments'
import { getDocumentsByLease } from '@findstoop/shared/api/documents'
import { formatUsd, formatLocalDate } from '@findstoop/shared/lib/format'
import type { Payment } from '@findstoop/shared/types/payment'
import type { Document } from '@findstoop/shared/types/document'
import type { GeneratedDocument } from '@findstoop/shared/types/generatedDocument'
import {
  ArrowLeft, Loader2, CheckCircle2, Circle, Scale, Download, FileText, ExternalLink,
} from 'lucide-react'

interface TimelineItem { date: string; label: string }

export default function EvictionPrep() {
  const { leaseId } = useParams<{ leaseId: string }>()
  const navigate = useNavigate()
  const [bundle, setBundle] = useState<LeaseDocBundle | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [notices, setNotices] = useState<GeneratedDocument[]>([])
  const [uploaded, setUploaded] = useState<Document[]>([])
  const [leaseSignedAt, setLeaseSignedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!leaseId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [b, pays, gens, ups, leaseRow] = await Promise.all([
          getLeaseDocContext(leaseId),
          getPaymentsByLeaseIds([leaseId]),
          listGeneratedDocumentsForLease(leaseId),
          getDocumentsByLease(leaseId).catch(() => []),
          supabase.from('leases').select('signed_at').eq('id', leaseId).maybeSingle(),
        ])
        if (cancelled) return
        setBundle(b)
        setPayments(pays)
        setNotices(gens)
        setUploaded(ups)
        setLeaseSignedAt((leaseRow.data as { signed_at: string | null } | null)?.signed_at ?? null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [leaseId])

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-mute"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }
  if (!bundle) {
    return (
      <div className="text-center py-16">
        <p className="text-mute">Couldn't load this tenancy.</p>
        <Link to="/manager/documents" className="mt-3 inline-block text-sm text-brand-600 hover:underline">← Back to documents</Link>
      </div>
    )
  }

  const { source } = bundle
  const today = new Date().toISOString().slice(0, 10)
  const sentNotices = notices.filter((n) => n.sent_at)
  const missedRent = payments.filter((p) => p.type === 'rent' && p.status === 'pending' && p.due_date && p.due_date < today)

  // Timeline
  const timeline: TimelineItem[] = [
    ...(source.lease_start ? [{ date: source.lease_start, label: 'Lease started' }] : []),
    ...missedRent.map((p) => ({ date: p.due_date!, label: `Rent missed — ${formatUsd(Number(p.amount))}` })),
    ...sentNotices.map((n) => ({ date: (n.sent_at as string).slice(0, 10), label: `Sent: ${n.title}` })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const hasLeaseDoc = !!leaseSignedAt || uploaded.some((d) => d.type === 'lease')
  const hasInspection = uploaded.some((d) => d.type === 'inspection')

  const checklist = [
    { label: 'Signed lease agreement', done: hasLeaseDoc },
    { label: 'Rent payment ledger', done: payments.length > 0 },
    { label: 'Late-payment notices sent', done: sentNotices.length > 0 },
    { label: 'Move-in condition / inspection record', done: hasInspection },
  ]

  const exportLedger = () => {
    const rows = [
      ['Date', 'Type', 'Amount', 'Status', 'Due date', 'Paid at'].join(','),
      ...payments.map((p) => [
        new Date(p.created_at).toLocaleDateString(), p.type, p.amount, p.status,
        p.due_date ? formatLocalDate(p.due_date) : '', p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '',
      ].join(',')),
    ].join('\n')
    const url = URL.createObjectURL(new Blob([rows], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `payment-history-${leaseId?.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <button onClick={() => navigate('/manager/documents')} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
        <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Documents
      </button>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Eviction prep</h1>
        <p className="text-sm text-gray-500 mt-1">
          We can't go to court for you, but we can make sure you show up organized. Here's everything for {source.tenant_name} in one place.
        </p>
      </div>

      {/* Prominent disclaimer */}
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
        <Scale className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" strokeWidth={1.75} />
        <p className="text-sm text-amber-900 leading-relaxed">
          <strong>This isn't legal advice.</strong> Talk to a local landlord-tenant attorney before filing.{' '}
          <a href="https://www.ohiolegalhelp.org" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Ohio Legal Help</a>{' '}
          has a free referral tool.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Timeline */}
        <section className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-3">Case timeline</h2>
          <ol className="space-y-3">
            {timeline.map((t, i) => (
              <li key={i} className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm text-ink">{t.label}</p>
                  <p className="text-[11px] text-mute">{formatLocalDate(t.date)}</p>
                </div>
              </li>
            ))}
            {timeline.length === 0 && <li className="text-sm text-mute">Nothing recorded yet.</li>}
          </ol>
        </section>

        {/* Checklist */}
        <section className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-3">Document checklist</h2>
          <ul className="space-y-2.5">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-2.5">
                {c.done
                  ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" strokeWidth={1.75} />
                  : <Circle className="w-4 h-4 text-mute-400 shrink-0" strokeWidth={1.75} />}
                <span className={`text-sm ${c.done ? 'text-ink' : 'text-mute'}`}>{c.label}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-mute mt-3">A checkmark means we have it on file. Empty items are worth gathering before you file.</p>
        </section>
      </div>

      {/* Evidence export */}
      <section className="bg-white rounded-2xl border border-gray-200 p-4">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-3">Evidence to bring</h2>
        <div className="space-y-2">
          {hasLeaseDoc && (
            <EvidenceRow icon={FileText} label="Lease agreement (PDF)" href={`/lease-pdf/${leaseId}`} external />
          )}
          {sentNotices.map((n) => (
            <EvidenceRow key={n.id} icon={FileText} label={`${n.title} — sent ${formatLocalDate((n.sent_at as string).slice(0, 10))}`} href={`/document-print/${n.id}`} external />
          ))}
          <button onClick={exportLedger} disabled={payments.length === 0} className="w-full flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:bg-gray-50 disabled:opacity-40">
            <Download className="w-4 h-4 text-brand-600 shrink-0" strokeWidth={1.75} />
            <span className="text-sm text-ink flex-1">Payment history (CSV)</span>
          </button>
          <EvidenceRow icon={ExternalLink} label="Maintenance records (in case of a habitability defense)" href="/manager/maintenance" />
        </div>
      </section>
    </div>
  )
}

function EvidenceRow({ icon: Icon, label, href, external }: { icon: typeof FileText; label: string; href: string; external?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 hover:bg-gray-50"
    >
      <Icon className="w-4 h-4 text-brand-600 shrink-0" strokeWidth={1.75} />
      <span className="text-sm text-ink flex-1">{label}</span>
      <ExternalLink className="w-3.5 h-3.5 text-mute shrink-0" strokeWidth={1.75} />
    </a>
  )
}
