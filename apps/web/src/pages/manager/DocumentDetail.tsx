// Generated document detail + audit trail.
//
// Left: the rendered document (the same Letterhead the tenant/PDF shows).
// Right: every event from generated_document_events with actor + timestamp.

import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import {
  getGeneratedDocument, getDocumentEvents, voidDocument,
} from '@findstoop/shared/api/generatedDocuments'
import type { GeneratedDocument, GeneratedDocumentEvent, DocEvent } from '@findstoop/shared/types/generatedDocument'
import Letterhead from '../../components/documents/Letterhead'
import DocStatusBadge from '../../components/documents/DocStatusBadge'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import toast from 'react-hot-toast'
import { ArrowLeft, Printer, Ban, Loader2, CheckCircle2 } from 'lucide-react'

const EVENT_LABEL: Record<DocEvent, string> = {
  created: 'Created',
  reviewed: 'Reviewed',
  edited: 'Edited',
  sent: 'Sent',
  opened: 'Opened by tenant',
  signed: 'Signed by tenant',
  voided: 'Voided',
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<GeneratedDocument | null>(null)
  const [events, setEvents] = useState<GeneratedDocumentEvent[]>([])
  const [actors, setActors] = useState<Record<string, string>>({})
  const [propertyAddress, setPropertyAddress] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmVoid, setConfirmVoid] = useState(false)

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      const [d, ev] = await Promise.all([getGeneratedDocument(id), getDocumentEvents(id)])
      setDoc(d)
      setEvents(ev)
      const actorIds = Array.from(new Set(ev.map((e) => e.actor_id).filter(Boolean))) as string[]
      if (actorIds.length) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
        const map: Record<string, string> = {}
        ;(profiles ?? []).forEach((p: any) => { map[p.id] = p.full_name ?? p.email ?? 'Someone' })
        setActors(map)
      }
      if (d?.property_id) {
        const { data: p } = await supabase.from('properties').select('address, city, state, zip').eq('id', d.property_id).maybeSingle()
        if (p) setPropertyAddress([p.address, `${p.city}, ${p.state} ${p.zip}`].filter(Boolean).join(' · '))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleVoid = async () => {
    if (!doc || !user?.id) return
    try {
      await voidDocument(doc.id, user.id)
      toast.success('Document voided')
      setConfirmVoid(false)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-mute"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }
  if (!doc) {
    return (
      <div className="text-center py-16">
        <p className="text-mute">Document not found.</p>
        <Link to="/manager/documents" className="mt-3 inline-block text-sm text-brand-600 hover:underline">← Back to documents</Link>
      </div>
    )
  }

  const canVoid = doc.status !== 'voided' && doc.status !== 'signed'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/manager/documents')} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Documents
        </button>
        <div className="flex items-center gap-2">
          <a
            href={`/document-print/${doc.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg"
          >
            <Printer className="w-4 h-4" strokeWidth={1.75} /> Print / PDF
          </a>
          {canVoid && (
            <button onClick={() => setConfirmVoid(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg">
              <Ban className="w-4 h-4" strokeWidth={1.75} /> Void
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">{doc.title}</h1>
        <DocStatusBadge status={doc.status} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Preview */}
        <div className="lg:col-span-2 space-y-3">
          {doc.status === 'signed' && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-800">
              <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.75} /> Signed by the tenant.
            </div>
          )}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-10">
            {doc.generated_body
              ? <Letterhead reference={doc.title} propertyAddress={propertyAddress} bodyHtml={doc.generated_body} />
              : <p className="text-sm text-mute">No rendered content.</p>}
          </div>
        </div>

        {/* Audit trail */}
        <div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-3">Activity</h2>
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-ink">
                      {EVENT_LABEL[e.event]}
                      {e.event === 'sent' && (e.meta as any)?.method ? ` (${(e.meta as any).method})` : ''}
                    </p>
                    <p className="text-[11px] text-mute">
                      {e.actor_id ? actors[e.actor_id] ?? '' : ''}
                      {e.actor_id ? ' · ' : ''}
                      {new Date(e.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </li>
              ))}
              {events.length === 0 && <li className="text-sm text-mute">No activity yet.</li>}
            </ol>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmVoid}
        title="Void this document?"
        message={`"${doc.title}" will be marked voided. It stays in your records for the audit trail.`}
        confirmLabel="Void"
        danger
        onConfirm={handleVoid}
        onCancel={() => setConfirmVoid(false)}
      />
    </div>
  )
}
