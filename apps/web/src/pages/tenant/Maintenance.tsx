import { useState, useRef } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useTenantMaintenance } from '@findstoop/shared/hooks/useMaintenance'
import { useTenantDashboard } from '@findstoop/shared/hooks/useTenantDashboard'
import Modal from '../../components/shared/Modal'
import FormField, { inputClass, selectClass } from '../../components/shared/FormField'
import EmptyIllustration from '../../components/shared/EmptyIllustration'
import SelfTriageCard, { fetchSelfTriage, type SelfTriageResult } from '../../components/tenant/SelfTriageCard'
import type { MaintenancePriority, MaintenanceStatus } from '@findstoop/shared/types/maintenance'
import toast from 'react-hot-toast'
import { Wrench, Camera, RefreshCw } from 'lucide-react'
import MaintenanceTimeline, { timelineSteps } from '../../components/tenant/MaintenanceTimeline'

const PRIORITY_LABEL: Record<MaintenancePriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  emergency: 'Emergency',
}

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

const PRIORITY_BADGE: Record<MaintenancePriority, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  emergency: 'bg-red-100 text-red-700',
}

const STATUS_BADGE: Record<MaintenanceStatus, string> = {
  open: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-1/3" />
        </div>
      ))}
    </div>
  )
}

// Retry remounts the whole subtree below, which re-runs every hook's
// initial fetch (useTenantDashboard's lease lookup + useTenantMaintenance's
// request list) — the simplest reliable "try again" since neither hook
// exposes every failure mode a caller could otherwise retry piecemeal.
export default function TenantMaintenance() {
  const [retryCount, setRetryCount] = useState(0)
  return <TenantMaintenanceInner key={retryCount} onRetry={() => setRetryCount((c) => c + 1)} />
}

function TenantMaintenanceInner({ onRetry }: { onRetry: () => void }) {
  const { user } = useAuth()
  const tenantId = user?.id
  const { lease, error: leaseError } = useTenantDashboard(tenantId)
  const { requests, loading, submitting, submit, error: requestsError } = useTenantMaintenance(tenantId)
  const error = leaseError || requestsError

  const [showNew, setShowNew] = useState(false)
  const [filterStatus, setFilterStatus] = useState<MaintenanceStatus | 'all'>('all')
  const [selectedRequest, setSelectedRequest] = useState<(typeof requests)[0] | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<MaintenancePriority>('low')
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // Pre-submit self-triage ("try this first"). checking = the ~6s AI lookup;
  // triage = suggestions being shown; triageChecked = we already tried once,
  // so the next submit goes straight through.
  const [triage, setTriage] = useState<SelfTriageResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [triageChecked, setTriageChecked] = useState(false)

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setPriority('low')
    setPhotos([])
    setPreviews([])
    setTriage(null)
    setChecking(false)
    setTriageChecked(false)
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 3)
    setPhotos(files)
    setPreviews(files.map((f) => URL.createObjectURL(f)))
  }

  // Creates the ticket. If self-triage ran and the tenant proceeded anyway,
  // note the tried steps in the description so the landlord sees "tenant
  // already tried X" (no dedicated column exists; the description feeds the
  // landlord-side AI triage too, which benefits from the context).
  const doSubmit = async (tried: SelfTriageResult | null) => {
    if (!tenantId || !lease) return
    try {
      const triedNote = tried && tried.self_fixes.length > 0
        ? `\n\n(Before submitting, tried the app's quick-fix suggestions without success: ${tried.self_fixes.map((f) => f.step).join('; ')})`
        : ''
      await submit(tenantId, {
        unit_id: lease.unit_id,
        title,
        description: (description + triedNote).trim(),
        priority,
        photos,
      })
      toast.success('Request submitted')
      setShowNew(false)
      resetForm()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId || !lease) return
    // One best-effort "try this first" check before creating the ticket.
    // Skipped for emergencies; any failure or timeout falls through to a
    // normal submit — this must never block a request.
    if (!triageChecked && priority !== 'emergency' && (title.trim() || description.trim())) {
      setChecking(true)
      const result = await fetchSelfTriage(title, description)
      setChecking(false)
      setTriageChecked(true)
      if (result && (result.self_fixes.length > 0 || result.safety_warning)) {
        setTriage(result)
        return
      }
    }
    await doSubmit(null)
  }

  // "That fixed it!" — dismiss without creating a ticket.
  const handleResolved = () => {
    setShowNew(false)
    resetForm()
    toast.success('Glad that fixed it — no request was sent.')
  }

  const filtered = filterStatus === 'all'
    ? requests
    : requests.filter((r) => r.status === filterStatus)

  const open = requests.filter((r) => r.status === 'open' || r.status === 'in_progress').length

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Maintenance</h1>
          {open > 0 && (
            <p className="text-sm text-orange-600 font-medium">{open} open request{open !== 1 ? 's' : ''}</p>
          )}
        </div>
        <button
          onClick={() => setShowNew(true)}
          disabled={!lease}
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
        >
          + New Request
        </button>
      </div>

      {!lease && !loading && !error && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          You don't have an active lease. Contact your property manager to submit maintenance requests.
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filterStatus === s
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'All' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <Skeleton />
      ) : error ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-sm font-medium text-ink">Couldn't load your maintenance requests.</p>
          <p className="text-xs text-mute mt-1">Check your connection and try again.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink bg-white border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
            Check again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyIllustration
          name="maintenance"
          Fallback={Wrench}
          title="No maintenance requests yet"
          subtitle="When something breaks or needs attention, file a request and your landlord will see it right away."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => (
            <button
              key={req.id}
              onClick={() => setSelectedRequest(req)}
              className={`w-full text-left bg-white rounded-xl p-4 border shadow-sm transition-colors hover:border-brand-300 ${
                req.priority === 'emergency' ? 'border-red-300 bg-red-50' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{req.title}</p>
                  {req.description && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{req.description}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1.5">
                    {new Date(req.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 items-end shrink-0">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${PRIORITY_BADGE[req.priority]}`}>
                    {PRIORITY_LABEL[req.priority]}
                  </span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[req.status]}`}>
                    {STATUS_LABEL[req.status]}
                  </span>
                </div>
              </div>
              {req.images && req.images.length > 0 && (
                <div className="flex gap-1.5 mt-2">
                  {req.images.slice(0, 3).map((url, i) => (
                    <img key={i} src={url} alt="" loading="lazy" decoding="async" className="w-10 h-10 rounded-lg object-cover" />
                  ))}
                </div>
              )}
              {/* Mini progress track — the card-level glance version of the
                  timeline in the detail view. */}
              <div className="flex gap-1 mt-3" aria-hidden="true">
                {timelineSteps(req).map((step) => (
                  <span
                    key={step.key}
                    className={`h-1 flex-1 rounded-full ${
                      step.state === 'done' ? 'bg-brand-500' : step.state === 'current' ? 'bg-brand-300' : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* New Request Modal */}
      <Modal open={showNew} onClose={() => { setShowNew(false); resetForm() }} title="New Maintenance Request">
        {triage ? (
          <SelfTriageCard
            triage={triage}
            submitting={submitting}
            onResolved={handleResolved}
            onSubmit={() => { void doSubmit(triage) }}
          />
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Title" required>
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Leaking kitchen faucet"
              required
            />
          </FormField>

          <FormField label="Description">
            <textarea
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the issue in detail..."
            />
          </FormField>

          <FormField label="Priority" required>
            <select
              className={selectClass}
              value={priority}
              onChange={(e) => setPriority(e.target.value as MaintenancePriority)}
            >
              <option value="low">Low — Not urgent</option>
              <option value="medium">Medium — Needs attention soon</option>
              <option value="high">High — Urgent</option>
              <option value="emergency">Emergency — Safety hazard</option>
            </select>
          </FormField>

          {priority === 'emergency' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              For life-threatening emergencies, call 911. For urgent safety issues, also call your property manager directly.
            </div>
          )}

          <FormField label="Photos (optional, up to 3)">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoChange}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                <Camera className="w-4 h-4" strokeWidth={1.75} />
                Tap to add photos
              </span>
            </button>
            {previews.length > 0 && (
              <div className="flex gap-2 mt-2">
                {previews.map((src, i) => (
                  <img key={i} src={src} alt="" loading="lazy" decoding="async" className="w-16 h-16 rounded-lg object-cover" />
                ))}
              </div>
            )}
          </FormField>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShowNew(false); resetForm() }}
              className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || checking || !title}
              className="flex-1 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {checking ? 'Checking for quick fixes…' : submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
        )}
      </Modal>

      {/* Detail Modal */}
      {selectedRequest && (
        <Modal
          open={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          title={selectedRequest.title}
        >
          <div className="space-y-4">
            <div className="flex gap-2">
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${PRIORITY_BADGE[selectedRequest.priority]}`}>
                {PRIORITY_LABEL[selectedRequest.priority]}
              </span>
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[selectedRequest.status]}`}>
                {STATUS_LABEL[selectedRequest.status]}
              </span>
            </div>

            {/* Where things stand — package-tracking view of the request. */}
            <div className="bg-gray-50 rounded-xl p-4">
              <MaintenanceTimeline request={selectedRequest} />
            </div>

            {selectedRequest.description && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-gray-700">{selectedRequest.description}</p>
              </div>
            )}

            {selectedRequest.manager_notes && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Manager Notes</p>
                <p className="text-sm text-blue-800">{selectedRequest.manager_notes}</p>
              </div>
            )}

            {selectedRequest.images && selectedRequest.images.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Photos</p>
                <div className="grid grid-cols-3 gap-2">
                  {selectedRequest.images.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="" loading="lazy" decoding="async" className="w-full aspect-square rounded-lg object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500">
              Submitted {new Date(selectedRequest.created_at).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric',
              })}
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
