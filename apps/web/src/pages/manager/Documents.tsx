import { useState, useRef } from 'react'
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

const DOC_TYPE_LABEL: Record<DocumentType, string> = {
  lease: 'Lease Agreement',
  addendum: 'Addendum',
  inspection: 'Inspection Report',
  notice: 'Notice',
  other: 'Other',
}

const DOC_TYPE_ICON: Record<DocumentType, string> = {
  lease: '📋',
  addendum: '📝',
  inspection: '🔍',
  notice: '📣',
  other: '📄',
}

function FileIcon({ type }: { type: DocumentType }) {
  return <span className="text-2xl">{DOC_TYPE_ICON[type]}</span>
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
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📁</p>
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
                  <span className="text-xs text-gray-400">{DOC_TYPE_LABEL[doc.type]}</span>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-400">{getTenantName(doc.lease_id)}</span>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-400">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleDownload(doc)}
                  className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                  title="Download"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                <button
                  onClick={() => setDocToDelete(doc)}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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
                <span className="text-gray-800 font-medium">📄 {file.name}</span>
              ) : (
                '📎 Click to choose file'
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
