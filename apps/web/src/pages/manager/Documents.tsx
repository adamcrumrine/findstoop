import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { useLeases } from '@findstoop/shared/hooks/useLeases'
import { useManagerDocuments } from '@findstoop/shared/hooks/useDocuments'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import FormField, { inputClass, selectClass } from '../../components/shared/FormField'
import type { Document, DocumentType } from '@findstoop/shared/types/document'
import toast from 'react-hot-toast'
import {
  ClipboardList, FilePlus2, Search, Megaphone, FileText,
  Folder, Paperclip, ExternalLink, type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

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
  const managerId = user?.id
  const { properties, loading: propsLoading } = useProperties(managerId)
  const propertyIds = properties.map((p) => p.id)
  const { units, loading: unitsLoading } = useUnits(propertyIds)
  const unitIds = units.map((u) => u.id)
  const { leases, loading: leasesLoading } = useLeases(unitIds)
  const leaseIds = leases.map((l) => l.id)
  const { documents, loading: docsLoading, uploading, upload, remove, getDownloadUrl } = useManagerDocuments(leaseIds)

  const loading = propsLoading || unitsLoading || leasesLoading || docsLoading

  const [showUpload, setShowUpload] = useState(false)
  const [docToDelete, setDocToDelete] = useState<Document | null>(null)
  const [filterType, setFilterType] = useState<DocumentType | 'all'>('all')
  const [filterLease, setFilterLease] = useState<string>('all')

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

  const activeLeases = leases.filter((l) => l.status === 'active')

  const filtered = documents
    .filter((d) => filterType === 'all' || d.type === filterType)
    .filter((d) => filterLease === 'all' || d.lease_id === filterLease)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">{documents.length} document{documents.length !== 1 ? 's' : ''} across all leases</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          disabled={activeLeases.length === 0}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
        >
          + Upload
        </button>
      </div>

      {activeLeases.length === 0 && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          No active leases found. Documents can only be uploaded to active leases.
        </div>
      )}

      {/* Move-in / move-out inspections — these aren't in the `documents` table;
          they're stored separately and surfaced here as quick links. */}
      <InspectionsRecent leaseIds={leaseIds} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[140px]">
          <select
            className={selectClass}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as DocumentType | 'all')}
          >
            <option value="all">All Types</option>
            {(Object.keys(DOC_TYPE_LABEL) as DocumentType[]).map((t) => (
              <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <select
            className={selectClass}
            value={filterLease}
            onChange={(e) => setFilterLease(e.target.value)}
          >
            <option value="all">All Tenants</option>
            {leases.map((l) => (
              <option key={l.id} value={l.id}>
                {l.profile?.full_name ?? l.profile?.email ?? l.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Documents list */}
      {loading ? (
        <Skeleton />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Folder className="w-12 h-12 mx-auto mb-3 text-mute-400" strokeWidth={1.5} />
          <p className="text-sm">No documents found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 bg-white rounded-xl px-4 py-3.5 border border-gray-100 shadow-sm"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                <FileIcon type={doc.type} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{doc.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500">{DOC_TYPE_LABEL[doc.type]}</span>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-500">{getTenantName(doc.lease_id)}</span>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-500">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleDownload(doc)}
                  className="p-2 rounded-lg text-gray-500 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                  title="Download"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                <button
                  onClick={() => setDocToDelete(doc)}
                  className="p-2 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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

// ── Recent inspections row ─────────────────────────────────────────────
// Pulls inspections across all of this manager's leases and renders a
// horizontal scroller of cards. Each card → opens the editor; if both
// parties have signed, the card shows a "PDF" link too.
interface InspectionRow {
  id: string
  lease_id: string
  type: 'move_in' | 'move_out'
  state: 'draft' | 'manager_signed' | 'tenant_signed' | 'both_signed'
  updated_at: string
  manager_signed_at: string | null
  tenant_signed_at: string | null
  lease?: {
    unit?: { unit_number: string; property?: { name: string } | null } | null
    tenant?: { full_name: string | null } | null
  } | null
}

function InspectionsRecent({ leaseIds }: { leaseIds: string[] }) {
  const [rows, setRows] = useState<InspectionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (leaseIds.length === 0) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('inspections')
        .select(`
          id, lease_id, type, state, updated_at, manager_signed_at, tenant_signed_at,
          lease:leases!inspections_lease_id_fkey (
            tenant:profiles!leases_tenant_id_fkey ( full_name ),
            unit:units!leases_unit_id_fkey (
              unit_number,
              property:properties!units_property_id_fkey ( name )
            )
          )
        `)
        .in('lease_id', leaseIds)
        .order('updated_at', { ascending: false })
      if (!cancelled) {
        setRows((data ?? []) as unknown as InspectionRow[])
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [leaseIds])

  if (loading) return null
  if (rows.length === 0) return null

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold">Move-in / move-out checklists</h2>
        <span className="text-xs text-mute">{rows.length} total</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r) => {
          const stateCfg =
            r.state === 'both_signed'                                       ? { label: 'Signed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' } :
            r.state === 'manager_signed' || r.state === 'tenant_signed'     ? { label: 'Awaiting signature', cls: 'bg-amber-50 text-amber-700 border-amber-200' } :
                                                                              { label: 'Draft', cls: 'bg-blue-50 text-blue-700 border-blue-200' }
          const propLabel = r.lease?.unit
            ? `${r.lease.unit.property?.name ?? 'Property'} · Unit ${r.lease.unit.unit_number}`
            : 'Unit'
          return (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
                  <ClipboardList className="w-4 h-4" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">{r.type === 'move_in' ? 'Move-in' : 'Move-out'} — {propLabel}</p>
                  <p className="text-xs text-mute truncate">{r.lease?.tenant?.full_name ?? 'Tenant'}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${stateCfg.cls}`}>
                      {stateCfg.label}
                    </span>
                    <span className="text-[10px] text-mute">{new Date(r.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-2.5">
                <Link
                  to={`/manager/lease/${r.lease_id}/inspection/${r.type}`}
                  className="text-xs font-medium text-brand-700 hover:text-brand-800 hover:underline"
                >
                  {r.state === 'both_signed' ? 'View' : 'Continue'}
                </Link>
                {r.state === 'both_signed' && (
                  <Link
                    to={`/inspection-pdf/${r.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs font-medium text-mute hover:text-ink"
                  >
                    <ExternalLink className="w-3 h-3" strokeWidth={2} />
                    PDF
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
