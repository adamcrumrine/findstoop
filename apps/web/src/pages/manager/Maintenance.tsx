import { useState } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { useManagerMaintenance } from '@findstoop/shared/hooks/useMaintenance'
import Modal from '../../components/shared/Modal'
import FormField, { selectClass } from '../../components/shared/FormField'
import type { MaintenancePriority, MaintenanceStatus } from '@findstoop/shared/types/maintenance'
import toast from 'react-hot-toast'
import { Wrench } from 'lucide-react'

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

const PRIORITY_ORDER: Record<MaintenancePriority, number> = {
  emergency: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse">
          <div className="flex justify-between mb-2">
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-4 bg-gray-100 rounded w-16" />
          </div>
          <div className="h-3 bg-gray-100 rounded w-1/3" />
        </div>
      ))}
    </div>
  )
}

export default function ManagerMaintenance() {
  const { user } = useAuth()
  const managerId = user?.id
  const { properties, loading: propsLoading } = useProperties(managerId)
  const propertyIds = properties.map((p) => p.id)
  const { units, loading: unitsLoading } = useUnits(propertyIds)
  const unitIds = units.map((u) => u.id)
  const { requests, loading: reqLoading, updating, updateStatus } = useManagerMaintenance(unitIds)

  const loading = propsLoading || unitsLoading || reqLoading

  const [filterStatus, setFilterStatus] = useState<MaintenanceStatus | 'all'>('all')
  const [filterPriority, setFilterPriority] = useState<MaintenancePriority | 'all'>('all')
  const [selectedRequest, setSelectedRequest] = useState<(typeof requests)[0] | null>(null)

  // Update modal state
  const [newStatus, setNewStatus] = useState<MaintenanceStatus>('open')
  const [notes, setNotes] = useState('')

  const openDetail = (req: (typeof requests)[0]) => {
    setSelectedRequest(req)
    setNewStatus(req.status)
    setNotes(req.manager_notes ?? '')
  }

  const handleUpdate = async () => {
    if (!selectedRequest) return
    try {
      await updateStatus(selectedRequest.id, newStatus, notes || undefined)
      toast.success('Request updated')
      setSelectedRequest(null)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  // Lookup helpers
  const unitMap = Object.fromEntries(units.map((u) => [u.id, u]))
  const propertyMap = Object.fromEntries(properties.map((p) => [p.id, p]))

  const filtered = requests
    .filter((r) => filterStatus === 'all' || r.status === filterStatus)
    .filter((r) => filterPriority === 'all' || r.priority === filterPriority)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])

  const emergency = filtered.filter((r) => r.priority === 'emergency' && r.status !== 'resolved' && r.status !== 'closed')
  const rest = filtered.filter((r) => !(r.priority === 'emergency' && r.status !== 'resolved' && r.status !== 'closed'))

  const stats = {
    open: requests.filter((r) => r.status === 'open').length,
    inProgress: requests.filter((r) => r.status === 'in_progress').length,
    emergency: requests.filter((r) => r.priority === 'emergency' && r.status !== 'resolved' && r.status !== 'closed').length,
  }

  const getUnitLabel = (unitId: string) => {
    const u = unitMap[unitId]
    if (!u) return 'Unknown unit'
    const p = propertyMap[u.property_id]
    return `${p?.name ?? 'Property'} · Unit ${u.unit_number}`
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Maintenance</h1>
        <p className="text-sm text-gray-500 mt-0.5">All maintenance requests across your properties</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-yellow-700">{stats.open}</p>
          <p className="text-xs text-yellow-600 font-medium">Open</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{stats.inProgress}</p>
          <p className="text-xs text-blue-600 font-medium">In Progress</p>
        </div>
        <div className={`rounded-xl p-3 text-center border ${stats.emergency > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
          <p className={`text-2xl font-bold ${stats.emergency > 0 ? 'text-red-700' : 'text-gray-400'}`}>{stats.emergency}</p>
          <p className={`text-xs font-medium ${stats.emergency > 0 ? 'text-red-600' : 'text-gray-400'}`}>Emergency</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[140px]">
          <select
            className={selectClass}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as MaintenanceStatus | 'all')}
          >
            <option value="all">All Statuses</option>
            {(Object.keys(STATUS_LABEL) as MaintenanceStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <select
            className={selectClass}
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as MaintenancePriority | 'all')}
          >
            <option value="all">All Priorities</option>
            {(Object.keys(PRIORITY_LABEL) as MaintenancePriority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Emergency banner */}
      {emergency.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4">
          <p className="text-sm font-bold text-red-700 mb-2">🚨 Emergency Requests ({emergency.length})</p>
          <div className="space-y-2">
            {emergency.map((req) => (
              <button
                key={req.id}
                onClick={() => openDetail(req)}
                className="w-full text-left bg-white border border-red-200 rounded-lg p-3 hover:border-red-400 transition-colors"
              >
                <p className="font-medium text-gray-900 text-sm">{req.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{getUnitLabel(req.unit_id)}</p>
                <span className={`inline-flex mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[req.status]}`}>
                  {STATUS_LABEL[req.status]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main list */}
      {loading ? (
        <Skeleton />
      ) : rest.length === 0 && emergency.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Wrench className="w-12 h-12 mx-auto mb-3 text-mute-400" strokeWidth={1.5} />
          <p className="text-sm">No maintenance requests</p>
        </div>
      ) : rest.length > 0 ? (
        <div className="space-y-3">
          {rest.map((req) => (
            <button
              key={req.id}
              onClick={() => openDetail(req)}
              className="w-full text-left bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:border-brand-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{req.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{getUnitLabel(req.unit_id)}</p>
                  {req.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-1">{req.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1.5">
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
                    <img key={i} src={url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      ) : null}

      {/* Detail / Update Modal */}
      {selectedRequest && (
        <Modal
          open={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          title={selectedRequest.title}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{getUnitLabel(selectedRequest.unit_id)}</p>

            <div className="flex gap-2">
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${PRIORITY_BADGE[selectedRequest.priority]}`}>
                {PRIORITY_LABEL[selectedRequest.priority]}
              </span>
            </div>

            {selectedRequest.description && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-gray-700">{selectedRequest.description}</p>
              </div>
            )}

            {selectedRequest.images && selectedRequest.images.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Photos</p>
                <div className="grid grid-cols-3 gap-2">
                  {selectedRequest.images.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="" className="w-full aspect-square rounded-lg object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Update Request</p>

              <FormField label="Status">
                <select
                  className={selectClass}
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as MaintenanceStatus)}
                >
                  {(Object.keys(STATUS_LABEL) as MaintenanceStatus[]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Notes for Tenant">
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Add a note visible to the tenant..."
                />
              </FormField>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedRequest(null)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={updating === selectedRequest.id}
                className="flex-1 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {updating === selectedRequest.id ? 'Saving…' : 'Save Changes'}
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center">
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
