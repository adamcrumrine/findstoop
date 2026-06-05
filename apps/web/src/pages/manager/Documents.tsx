import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { useLeases } from '@findstoop/shared/hooks/useLeases'
import { useManagerDocuments } from '@findstoop/shared/hooks/useDocuments'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import FormField, { inputClass, selectClass } from '../../components/shared/FormField'
import GeneratedDocumentsList from '../../components/documents/GeneratedDocumentsList'
import type { Document, DocumentType } from '@findstoop/shared/types/document'
import toast from 'react-hot-toast'
import {
  ClipboardList, FilePlus2, Search, Megaphone, FileText,
  Folder, Paperclip, Download, Trash2, type LucideIcon,
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

function FileIcon({ type }: { type: DocumentType }) {
  const Icon = DOC_TYPE_ICON[type]
  return <Icon className="w-5 h-5 text-ink shrink-0" strokeWidth={1.75} />
}

function Skeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 bg-white rounded-xl p-4 border border-gray-100 animate-pulse">
          <div className="w-10 h-10 rounded-lg bg-gray-200 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-gray-200 rounded w-1/2" />
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ManagerDocuments() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const managerId = user?.id
  const { properties, loading: propsLoading } = useProperties(managerId)
  const propertyIds = properties.map((p) => p.id)
  const { units, loading: unitsLoading } = useUnits(propertyIds)
  const unitIds = units.map((u) => u.id)
  const { leases, loading: leasesLoading } = useLeases(unitIds)
  const leaseIds = leases.map((l) => l.id)
  const { documents, loading: docsLoading, uploading, upload, remove, getDownloadUrl } = useManagerDocuments(leaseIds)

  const loading = propsLoading || unitsLoading || leasesLoading || docsLoading

  // Top-level tab: existing uploaded files vs. generated letters & notices.
  const [docTab, setDocTab] = useState<'files' | 'notices'>('files')
  const [showUpload, setShowUpload] = useState(false)
  const [docToDelete, setDocToDelete] = useState<Document | null>(null)
  // Grouping organizes the list into labeled sections; the lease-status
  // dropdown narrows the source set. Default group is "type" (most
  // common scan dimension) and default status is "active" so the page
  // opens on what's current.
  const [groupBy, setGroupBy] = useState<'type' | 'tenant' | 'property'>('type')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'upcoming' | 'pending' | 'expired' | 'terminated'>('all')

  // Upload form
  const [selectedLeaseId, setSelectedLeaseId] = useState('')
  const [docName, setDocName] = useState('')
  const [docType, setDocType] = useState<DocumentType>('lease')
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const resetForm = () => {
    setSelectedLeaseId('')
    setDocName('')
    setDocType('lease')
    setFile(null)
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !selectedLeaseId || !managerId) return
    try {
      await upload(file, selectedLeaseId, managerId, docName || file.name, docType)
      toast.success('Document uploaded')
      setShowUpload(false)
      resetForm()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleDownload = async (doc: Document) => {
    // Standard legal docs auto-attached to Ohio leases store an `app://...`
    // route instead of a storage path. Open these in-app.
    if (doc.storage_url?.startsWith('app://')) {
      const route = '/' + doc.storage_url.slice('app://'.length)
      window.open(route, '_blank', 'noopener,noreferrer')
      return
    }
    try {
      const url = await getDownloadUrl(doc)
      window.open(url, '_blank')
    } catch {
      toast.error('Failed to generate download link')
    }
  }

  const handleDelete = async () => {
    if (!docToDelete) return
    try {
      await remove(docToDelete)
      toast.success('Document deleted')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDocToDelete(null)
    }
  }

  const getTenantName = (leaseId: string) => {
    const l = leases.find((l) => l.id === leaseId)
    return l?.profile?.full_name ?? l?.profile?.email ?? 'Unknown Tenant'
  }

  // Property + unit label for a given lease, derived via unit→property
  // lookup. Used for "By property" grouping and the inline metadata line.
  const getPropertyLabel = (leaseId: string): string => {
    const l = leases.find((x) => x.id === leaseId)
    if (!l) return 'Unknown'
    const u = units.find((x) => x.id === l.unit_id)
    if (!u) return 'Unknown'
    const p = properties.find((x) => x.id === u.property_id)
    const propName = p?.name ?? p?.address ?? 'Property'
    return `${propName} · Unit ${u.unit_number}`
  }

  const getLeaseStatus = (leaseId: string): string => {
    const l = leases.find((x) => x.id === leaseId)
    return l?.status ?? 'unknown'
  }

  const activeLeases = leases.filter((l) => l.status === 'active')

  // Narrow by lease status first, then group what remains. Status filter
  // is a separate control from grouping — it answers "show me documents
  // tied to leases in this state" rather than reorganizing the layout.
  const visibleDocs = statusFilter === 'all'
    ? documents
    : documents.filter((d) => getLeaseStatus(d.lease_id) === statusFilter)

  // Build groups based on the current groupBy dimension. Each group has a
  // stable label + a list of documents. Sorted with a sensible per-dim
  // ordering (types in the DOC_TYPE_LABEL order; tenant/property alpha).
  const groups: Array<{ key: string; label: string; docs: Document[] }> = (() => {
    const map = new Map<string, { label: string; docs: Document[] }>()
    for (const d of visibleDocs) {
      let key: string
      let label: string
      if (groupBy === 'type') {
        key = d.type
        label = DOC_TYPE_LABEL[d.type]
      } else if (groupBy === 'tenant') {
        key = d.lease_id
        label = getTenantName(d.lease_id)
      } else {
        key = d.lease_id
        label = getPropertyLabel(d.lease_id)
      }
      if (!map.has(key)) map.set(key, { label, docs: [] })
      map.get(key)!.docs.push(d)
    }
    const arr = Array.from(map, ([key, v]) => ({ key, label: v.label, docs: v.docs }))
    if (groupBy === 'type') {
      const order = (Object.keys(DOC_TYPE_LABEL) as DocumentType[])
      arr.sort((a, b) => order.indexOf(a.key as DocumentType) - order.indexOf(b.key as DocumentType))
    } else {
      arr.sort((a, b) => a.label.localeCompare(b.label))
    }
    return arr
  })()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {docTab === 'files'
              ? `${documents.length} file${documents.length !== 1 ? 's' : ''} across all leases`
              : 'Generate and send letters & notices'}
          </p>
        </div>
        {docTab === 'files' ? (
          <button
            onClick={() => setShowUpload(true)}
            disabled={activeLeases.length === 0}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
          >
            + Upload
          </button>
        ) : (
          <button
            onClick={() => navigate('/manager/documents/new')}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            + New document
          </button>
        )}
      </div>

      {/* Tabs: uploaded files vs. generated letters & notices */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'files', label: 'Files' },
          { key: 'notices', label: 'Letters & Notices' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setDocTab(key)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              docTab === key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-mute hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {docTab === 'notices' && (
        <GeneratedDocumentsList properties={properties.map((p) => ({ id: p.id, name: p.name }))} />
      )}

      {docTab === 'files' && (<>

      {activeLeases.length === 0 && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          No active leases found. Documents can only be uploaded to active leases.
        </div>
      )}

      {/* Controls: group-by chips on the left (how to organize), lease-
          status dropdown on the right (what subset to show). Two
          independent dimensions — group answers "shape", status answers
          "what". Stack on mobile, side-by-side on sm+. */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-1.5">Group by</p>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:pb-0 sm:flex-wrap">
            {([
              { key: 'type',     label: 'Type' },
              { key: 'tenant',   label: 'Tenant' },
              { key: 'property', label: 'Property' },
            ] as const).map(({ key, label }) => {
              const active = groupBy === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setGroupBy(key)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-brand-600 text-white border border-brand-600'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        <div className="sm:w-44">
          <p className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-1.5">Lease status</p>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className={selectClass}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="upcoming">Upcoming</option>
            <option value="pending">Pending</option>
            <option value="expired">Expired</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>
      </div>

      {/* Grouped document sections. Each group renders a labeled header
          with a count + the doc cards beneath. Within a group, cards keep
          the same compact "type · filename · tenant·date" layout. The
          group dimension determines which line gets de-emphasized as
          redundant (e.g., when grouping by tenant, tenant name is hidden
          from the per-row metadata since the header already says it). */}
      {loading ? (
        <Skeleton />
      ) : visibleDocs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Folder className="w-12 h-12 mx-auto mb-3 text-mute-400" strokeWidth={1.5} />
          <p className="text-sm">
            {documents.length === 0 ? 'No documents found' : `No documents on ${statusFilter} leases`}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="flex items-baseline justify-between mb-1.5">
                <h3 className="text-xs uppercase tracking-wider text-mute font-semibold">{g.label}</h3>
                <span className="text-[11px] text-mute">{g.docs.length} {g.docs.length === 1 ? 'document' : 'documents'}</span>
              </div>
              <div className="space-y-2">
                {g.docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm flex items-stretch overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      className="flex-1 min-w-0 flex items-start gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                        <FileIcon type={doc.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{DOC_TYPE_LABEL[doc.type]}</p>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5" title={doc.name}>{doc.name}</p>
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {/* Skip the tenant/property piece when it's the
                              grouping dimension — already shown in the
                              group header above. */}
                          {groupBy !== 'tenant' && groupBy !== 'property' && (
                            <>
                              {getTenantName(doc.lease_id)} <span className="text-gray-300">·</span>{' '}
                            </>
                          )}
                          {new Date(doc.created_at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' })}
                        </p>
                      </div>
                      <Download className="w-4 h-4 text-gray-400 shrink-0 mt-1.5" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => setDocToDelete(doc)}
                      className="px-3 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors border-l border-gray-100"
                      title="Delete"
                      aria-label={`Delete ${doc.name}`}
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      </>)}

      {/* Upload Modal */}
      <Modal open={showUpload} onClose={() => { setShowUpload(false); resetForm() }} title="Upload Document">
        <form onSubmit={handleUpload} className="space-y-4">
          <FormField label="Tenant / Lease" required>
            <select
              className={selectClass}
              value={selectedLeaseId}
              onChange={(e) => setSelectedLeaseId(e.target.value)}
              required
            >
              <option value="">Select a tenant…</option>
              {activeLeases.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.profile?.full_name ?? l.profile?.email ?? l.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Document Type" required>
            <select
              className={selectClass}
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocumentType)}
            >
              {(Object.keys(DOC_TYPE_LABEL) as DocumentType[]).map((t) => (
                <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Display Name">
            <input
              className={inputClass}
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="Leave blank to use filename"
            />
          </FormField>

          <FormField label="File" required>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-300 rounded-lg py-4 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
            >
              {file ? (
                <span className="text-ink font-medium inline-flex items-center gap-2">
                  <FileText className="w-4 h-4" strokeWidth={1.75} />
                  {file.name}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Paperclip className="w-4 h-4" strokeWidth={1.75} />
                  Click to choose file
                </span>
              )}
            </button>
          </FormField>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShowUpload(false); resetForm() }}
              className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file || !selectedLeaseId}
              className="flex-1 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!docToDelete}
        title="Delete Document"
        message={`Are you sure you want to delete "${docToDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDocToDelete(null)}
      />
    </div>
  )
}

