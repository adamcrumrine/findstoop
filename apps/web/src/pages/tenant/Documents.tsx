import { useEffect, useState } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useTenantDashboard } from '@findstoop/shared/hooks/useTenantDashboard'
import { useTenantDocuments } from '@findstoop/shared/hooks/useDocuments'
import type { Document, DocumentType } from '@findstoop/shared/types/document'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import EmptyIllustration from '../../components/shared/EmptyIllustration'
import {
  ClipboardList, FilePlus2, Search, Megaphone, FileText, Folder,
  type LucideIcon,
} from 'lucide-react'

const DOC_TYPE_LABEL: Record<DocumentType, string> = {
  lease: 'Lease Agreement',
  addendum: 'Addendum',
  inspection: 'Inspection Report',
  notice: 'Notice',
  other: 'Other',
}

const DOC_TYPE_ICON: Record<DocumentType, LucideIcon> = {
  lease: ClipboardList,
  addendum: FilePlus2,
  inspection: Search,
  notice: Megaphone,
  other: FileText,
}

function DocIcon({ type, className = 'w-5 h-5' }: { type: DocumentType; className?: string }) {
  const Icon = DOC_TYPE_ICON[type]
  return <Icon className={className} strokeWidth={1.75} />
}

const DOC_TYPE_COLOR: Record<DocumentType, string> = {
  lease: 'bg-brand-50 text-brand-700',
  addendum: 'bg-purple-50 text-purple-700',
  inspection: 'bg-blue-50 text-blue-700',
  notice: 'bg-orange-50 text-orange-700',
  other: 'bg-gray-50 text-gray-600',
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 bg-white rounded-xl p-4 border border-gray-100 animate-pulse">
          <div className="w-10 h-10 rounded-lg bg-gray-200 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-gray-200 rounded w-2/3" />
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
          <div className="w-8 h-8 rounded-lg bg-gray-100 shrink-0" />
        </div>
      ))}
    </div>
  )
}

function DocCard({ doc, onDownload }: { doc: Document; onDownload: (doc: Document) => void }) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      await onDownload(doc)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3.5 border border-gray-100 shadow-sm">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${DOC_TYPE_COLOR[doc.type]}`}>
        <DocIcon type={doc.type} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm truncate">{doc.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-400">{DOC_TYPE_LABEL[doc.type]}</span>
          <span className="text-gray-200">·</span>
          <span className="text-xs text-gray-400">
            {new Date(doc.created_at).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })}
          </span>
        </div>
      </div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40"
        title="Download"
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
      </button>
    </div>
  )
}

export default function TenantDocuments() {
  const { user } = useAuth()
  const tenantId = user?.id
  const { lease, loading: leaseLoading } = useTenantDashboard(tenantId)
  const { documents, loading: docsLoading, getDownloadUrl } = useTenantDocuments(lease?.id ?? null)

  const loading = leaseLoading || docsLoading
  const [filterType, setFilterType] = useState<DocumentType | 'all'>('all')

  // Stamp the "seen" marker on mount so the green cherry dot on the bottom
  // nav clears once the tenant lands here. Realtime channel in
  // useTenantBadges picks up the change.
  useEffect(() => {
    if (!tenantId) return
    void supabase
      .from('profiles')
      .update({ documents_seen_at: new Date().toISOString() })
      .eq('id', tenantId)
  }, [tenantId])

  const handleDownload = async (doc: Document) => {
    // Synthetic lease entry — the id is the sentinel 'lease-agreement', and
    // we open the rendered PDF route (which has its own "Save as PDF" button).
    if (doc.id === 'lease-agreement') {
      window.open(`/lease-pdf/${doc.lease_id}`, '_blank', 'noopener,noreferrer')
      return
    }
    try {
      const url = await getDownloadUrl(doc)
      window.open(url, '_blank')
    } catch {
      toast.error('Failed to open document. Please try again.')
    }
  }

  // Synthetic "Lease Agreement" entry — rendered at the top of the list once
  // the tenant has a signed lease. It points at the existing /lease-pdf/:id
  // route which provides a printable / save-as-PDF view of the executed
  // lease. We don't write a row to the documents table because the lease IS
  // the canonical source of truth; this is just a surfaced shortcut.
  const synthetic: Document[] = lease?.signed_at
    ? [{
        id: 'lease-agreement',
        lease_id: lease.id,
        uploaded_by: lease.tenant_id,
        name: `Signed Lease Agreement`,
        type: 'lease' as DocumentType,
        storage_url: '',
        created_at: lease.signed_at,
      }]
    : []
  const allDocs = [...synthetic, ...documents]

  const filtered = filterType === 'all'
    ? allDocs
    : allDocs.filter((d) => d.type === filterType)

  // Group by type for summary
  const counts = (Object.keys(DOC_TYPE_LABEL) as DocumentType[]).reduce<Record<DocumentType, number>>(
    (acc, t) => ({ ...acc, [t]: allDocs.filter((d) => d.type === t).length }),
    {} as Record<DocumentType, number>
  )

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Documents</h1>
        <p className="text-sm text-gray-500 mt-0.5">Documents shared by your property manager</p>
      </div>

      {!lease && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          No active lease found. Documents will appear here once your lease is set up.
        </div>
      )}

      {/* Type summary pills */}
      {allDocs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filterType === 'all' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({allDocs.length})
          </button>
          {(Object.keys(DOC_TYPE_LABEL) as DocumentType[])
            .filter((t) => counts[t] > 0)
            .map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  filterType === t ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <DocIcon type={t} className="w-3.5 h-3.5" />
                  {DOC_TYPE_LABEL[t]} ({counts[t]})
                </span>
              </button>
            ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <Skeleton />
      ) : filtered.length === 0 ? (
        <EmptyIllustration
          name="leases"
          Fallback={Folder}
          title="No documents yet"
          subtitle="Your signed lease will appear here once both parties have signed. Your landlord can also upload addenda, notices, and inspections."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <DocCard key={doc.id} doc={doc} onDownload={handleDownload} />
          ))}
        </div>
      )}
    </div>
  )
}
