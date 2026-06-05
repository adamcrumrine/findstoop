// "Letters & Notices" tab content — the list of generated documents.
//
// Rows show the document type, who it's for, status, and date, with quick
// actions (Preview / Void). Clicking a row opens the detail + audit page.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useGeneratedDocuments } from '@findstoop/shared/hooks/useGeneratedDocuments'
import type { GeneratedDocument, DocStatus } from '@findstoop/shared/types/generatedDocument'
import { selectClass } from '../shared/FormField'
import ConfirmDialog from '../shared/ConfirmDialog'
import DocStatusBadge from './DocStatusBadge'
import toast from 'react-hot-toast'
import { FileText, Eye, Ban, Plus } from 'lucide-react'

interface Props {
  properties: Array<{ id: string; name: string }>
}

function recipientLine(doc: GeneratedDocument): string {
  const meta = (doc.meta ?? {}) as { recipient_name?: string; unit_label?: string }
  return [meta.recipient_name, meta.unit_label ? `Unit ${meta.unit_label}` : null]
    .filter(Boolean).join(' · ') || 'Unaddressed'
}

export default function GeneratedDocumentsList({ properties }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties])
  const { documents, loading, error, voidDoc } = useGeneratedDocuments(propertyIds)

  const [propertyFilter, setPropertyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | DocStatus>('all')
  const [toVoid, setToVoid] = useState<GeneratedDocument | null>(null)

  const visible = documents.filter((d) =>
    (propertyFilter === 'all' || d.property_id === propertyFilter) &&
    (statusFilter === 'all' || d.status === statusFilter)
  )

  const handleVoid = async () => {
    if (!toVoid || !user?.id) return
    try {
      await voidDoc(toVoid.id, user.id)
      toast.success('Document voided')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setToVoid(null)
    }
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        Couldn't load documents: {error}
      </div>
    )
  }

  // Empty state — no generated documents yet.
  if (!loading && documents.length === 0) {
    return (
      <div className="text-center py-16 max-w-md mx-auto">
        <FileText className="w-12 h-12 mx-auto mb-3 text-mute-400" strokeWidth={1.5} />
        <h3 className="text-base font-semibold text-gray-900">No documents yet</h3>
        <p className="text-sm text-gray-500 mt-1">
          Start with a rent increase notice or lease renewal — the two landlords send most often.
        </p>
        <button
          onClick={() => navigate('/manager/documents/new')}
          className="mt-5 inline-flex items-center gap-1.5 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          Create your first document
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="sm:w-56">
          <p className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-1.5">Property</p>
          <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className={selectClass}>
            <option value="all">All properties</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="sm:w-44">
          <p className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-1.5">Status</p>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={selectClass}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="pending_review">Pending Review</option>
            <option value="sent">Sent</option>
            <option value="signed">Signed</option>
            <option value="voided">Voided</option>
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-white rounded-xl border border-gray-100 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-mute text-center py-10">No documents match these filters.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((doc) => (
            <div key={doc.id} className="bg-white rounded-xl border border-gray-100 shadow-sm flex items-stretch overflow-hidden">
              <button
                type="button"
                onClick={() => navigate(`/manager/documents/${doc.id}`)}
                className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm truncate">{doc.title}</p>
                    <DocStatusBadge status={doc.status} />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {recipientLine(doc)} <span className="text-gray-300">·</span>{' '}
                    {new Date(doc.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </button>
              <div className="flex items-stretch border-l border-gray-100">
                {doc.generated_body && (
                  <a
                    href={`/document-print/${doc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 flex items-center text-gray-400 hover:text-brand-600 hover:bg-gray-50 transition-colors"
                    title="Preview / print"
                    aria-label="Preview"
                  >
                    <Eye className="w-4 h-4" strokeWidth={1.75} />
                  </a>
                )}
                {doc.status !== 'voided' && doc.status !== 'signed' && (
                  <button
                    onClick={() => setToVoid(doc)}
                    className="px-3 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors border-l border-gray-100"
                    title="Void"
                    aria-label="Void"
                  >
                    <Ban className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!toVoid}
        title="Void this document?"
        message={`"${toVoid?.title}" will be marked voided. This can't be undone, but it stays in your records.`}
        confirmLabel="Void"
        danger
        onConfirm={handleVoid}
        onCancel={() => setToVoid(null)}
      />
    </div>
  )
}
