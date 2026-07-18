import { useMemo, useState } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { useManagerMaintenance } from '@findstoop/shared/hooks/useMaintenance'
import { createExpense } from '@findstoop/shared/api/expenses'
import { formatUsdCents } from '@findstoop/shared/lib/format'
import Modal from '../../components/shared/Modal'
import FormField, { selectClass } from '../../components/shared/FormField'
import type { MaintenancePriority, MaintenanceStatus } from '@findstoop/shared/types/maintenance'
import toast from 'react-hot-toast'
import {
  Wrench, AlertTriangle, Clock, CheckCircle2, ImageIcon, Search,
  Building2, Sparkles, Loader2,
} from 'lucide-react'

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
  low:       'bg-slate-100 text-slate-600 border-slate-200',
  medium:    'bg-blue-50 text-blue-700 border-blue-200',
  high:      'bg-amber-50 text-amber-700 border-amber-200',
  emergency: 'bg-red-50 text-red-700 border-red-200',
}

const STATUS_BADGE: Record<MaintenanceStatus, string> = {
  open:        'bg-yellow-50 text-yellow-700 border-yellow-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  resolved:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed:      'bg-slate-50 text-slate-500 border-slate-200',
}

const PRIORITY_ORDER: Record<MaintenancePriority, number> = {
  emergency: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const CATEGORY_LABEL: Record<string, string> = {
  plumbing: 'Plumbing', electrical: 'Electrical', hvac: 'HVAC', appliance: 'Appliance',
  structural: 'Structural', pest: 'Pest', locks_security: 'Locks & security',
  landscaping: 'Landscaping', general: 'General',
}
const catLabel = (c: string | null) => (c ? CATEGORY_LABEL[c] ?? c : '')

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
  const { requests, loading: reqLoading, updating, updateStatus, triaging, triage } = useManagerMaintenance(unitIds)

  const loading = propsLoading || unitsLoading || reqLoading

  const [filterStatus, setFilterStatus] = useState<MaintenanceStatus | 'all' | 'active'>('active')
  const [filterPriority, setFilterPriority] = useState<MaintenancePriority | 'all'>('all')
  const [filterPropertyId, setFilterPropertyId] = useState<string | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedRequest, setSelectedRequest] = useState<(typeof requests)[0] | null>(null)

  // Update modal state
  const [newStatus, setNewStatus] = useState<MaintenanceStatus>('open')
  const [notes, setNotes] = useState('')
  const [cost, setCost] = useState('')
  const [vendor, setVendor] = useState('')
  const [logExpense, setLogExpense] = useState(true)

  const openDetail = (req: (typeof requests)[0]) => {
    setSelectedRequest(req)
    setNewStatus(req.status)
    setNotes(req.manager_notes ?? '')
    setCost(req.cost != null ? String(req.cost) : '')
    setVendor(req.vendor ?? '')
    setLogExpense(!req.expense_id) // default to logging unless already logged
  }

  const handleUpdate = async () => {
    if (!selectedRequest) return
    const costNum = cost.trim() ? Number(cost) : null
    if (costNum != null && !(costNum >= 0)) { toast.error('Enter a valid cost'); return }
    try {
      // Optionally log the cost as a Repairs expense on the property (once).
      let expenseId: string | null | undefined
      if (costNum && costNum > 0 && logExpense && !selectedRequest.expense_id) {
        const propertyId = unitMap[selectedRequest.unit_id]?.property_id
        if (propertyId) {
          const exp = await createExpense({
            property_id: propertyId,
            category: 'repairs',
            amount: costNum,
            expense_date: new Date().toISOString().slice(0, 10),
            vendor: vendor.trim() || null,
            note: `Maintenance: ${selectedRequest.title}`,
          })
          expenseId = exp.id
        }
      }
      await updateStatus(selectedRequest.id, newStatus, notes || undefined, {
        cost: costNum,
        vendor: vendor.trim() || null,
        ...(expenseId !== undefined ? { expense_id: expenseId } : {}),
      })
      toast.success(expenseId ? 'Updated · expense logged' : 'Request updated')
      setSelectedRequest(null)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleTriage = async (id: string) => {
    try {
      await triage(id)
      toast.success('AI triage complete')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  // Live reference so the detail modal reflects a just-run triage.
  const sel = selectedRequest ? (requests.find((r) => r.id === selectedRequest.id) ?? selectedRequest) : null

  // Lookup helpers — memoized so we don't rebuild on every render
  const unitMap     = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units])
  const propertyMap = useMemo(() => Object.fromEntries(properties.map((p) => [p.id, p])), [properties])

  const getUnitLabel = (unitId: string) => {
    const u = unitMap[unitId]
    if (!u) return 'Unknown unit'
    const p = propertyMap[u.property_id]
    return `${p?.name ?? 'Property'} · Unit ${u.unit_number}`
  }

  // ── Stats — always computed on the full set, not the filtered set ─────
  const stats = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    return {
      open:       requests.filter((r) => r.status === 'open').length,
      inProgress: requests.filter((r) => r.status === 'in_progress').length,
      emergency:  requests.filter((r) => r.priority === 'emergency' && r.status !== 'resolved' && r.status !== 'closed').length,
      resolvedThisMonth: requests.filter((r) => {
        if (r.status !== 'resolved' && r.status !== 'closed') return false
        // No updated_at on the schema today — use created_at as a proxy.
        // Tracks "issues from this month that are now resolved", close enough
        // until we add a resolved_at column.
        return new Date(r.created_at) >= monthStart
      }).length,
    }
  }, [requests])

  // ── Filtered list ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return requests
      .filter((r) => {
        if (filterStatus === 'all')    return true
        if (filterStatus === 'active') return r.status === 'open' || r.status === 'in_progress'
        return r.status === filterStatus
      })
      .filter((r) => filterPriority === 'all' || r.priority === filterPriority)
      .filter((r) => {
        if (filterPropertyId === 'all') return true
        const unit = unitMap[r.unit_id]
        return unit?.property_id === filterPropertyId
      })
      .filter((r) => {
        if (!term) return true
        return (
          r.title.toLowerCase().includes(term) ||
          (r.description ?? '').toLowerCase().includes(term)
        )
      })
      .sort((a, b) => {
        // Emergency open ones float to the top regardless of priority weight
        const ae = a.priority === 'emergency' && a.status !== 'resolved' && a.status !== 'closed' ? 0 : 1
        const be = b.priority === 'emergency' && b.status !== 'resolved' && b.status !== 'closed' ? 0 : 1
        if (ae !== be) return ae - be
        const pri = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
        if (pri !== 0) return pri
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [requests, filterStatus, filterPriority, filterPropertyId, search, unitMap])

  const hasAnyRequests = requests.length > 0

  return (
    <div className="space-y-5 max-w-6xl">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maintenance</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track and resolve requests across your properties.</p>
        </div>
        {properties.length > 1 && (
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-mute" strokeWidth={1.75} />
            <select
              className={`${selectClass} text-sm py-1.5 pr-7`}
              value={filterPropertyId}
              onChange={(e) => setFilterPropertyId(e.target.value)}
            >
              <option value="all">All properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Stat strip ──────────────────────────────────────────────
          Compact 4-up row on mobile (much shorter than the old 2x2
          grid), expands to a 4-col card grid at md+. Tapping a stat
          jumps the status filter so the strip doubles as a quick
          status chooser. */}
      <div className="grid grid-cols-4 md:gap-3 gap-1 bg-white md:bg-transparent rounded-xl md:rounded-none border md:border-0 border-gray-100 overflow-hidden">
        <StatTile Icon={Wrench}        label="Open"           shortLabel="Open"    value={stats.open}              tone="amber"   onClick={() => setFilterStatus('open')}        active={filterStatus === 'open'} />
        <StatTile Icon={Clock}         label="In progress"    shortLabel="Active"  value={stats.inProgress}        tone="blue"    onClick={() => setFilterStatus('in_progress')} active={filterStatus === 'in_progress'} />
        <StatTile Icon={AlertTriangle} label="Emergency"      shortLabel="Urgent"  value={stats.emergency}         tone={stats.emergency > 0 ? 'red' : 'gray'} onClick={() => { setFilterPriority('emergency'); setFilterStatus('active') }} active={filterPriority === 'emergency'} />
        <StatTile Icon={CheckCircle2}  label="Resolved (mo.)" shortLabel="Done"    value={stats.resolvedThisMonth} tone="emerald" onClick={() => setFilterStatus('resolved')}    active={filterStatus === 'resolved'} />
      </div>

      {/* ── Filters + search ────────────────────────────────────────────
          Mobile: two compact native <select>s side-by-side + a full-width
          search input. Saves ~80 vertical px vs the two pill rows + much
          easier to tap.
          sm+: the original pill rows render so desktop keeps the
          chip-style picker pattern. */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-3">
        {/* Mobile compact controls */}
        <div className="sm:hidden grid grid-cols-2 gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Filter by status"
          >
            <option value="active">Active (open + in progress)</option>
            <option value="all">Any status</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as MaintenancePriority | 'all')}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Filter by priority"
          >
            <option value="all">Any priority</option>
            <option value="emergency">Emergency</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Desktop pill rows */}
        <div className="hidden sm:flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-mute font-semibold mr-1">Status</span>
          {([
            { id: 'active',      label: 'Active' },
            { id: 'all',         label: 'All' },
            { id: 'open',        label: 'Open' },
            { id: 'in_progress', label: 'In progress' },
            { id: 'resolved',    label: 'Resolved' },
            { id: 'closed',      label: 'Closed' },
          ] as const).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setFilterStatus(s.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterStatus === s.id ? 'bg-ink text-white' : 'bg-gray-100 text-mute hover:bg-gray-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="hidden sm:flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-mute font-semibold mr-1">Priority</span>
          {(['all', 'emergency', 'high', 'medium', 'low'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setFilterPriority(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                filterPriority === p ? 'bg-ink text-white' : 'bg-gray-100 text-mute hover:bg-gray-200'
              }`}
            >
              {p === 'all' ? 'All' : PRIORITY_LABEL[p as MaintenancePriority]}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-mute" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Search title or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm placeholder-mute focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* ── List / empty / loading ───────────────────────────────── */}
      {loading ? (
        <Skeleton />
      ) : !hasAnyRequests ? (
        <EmptyStateNoRequests propertyCount={properties.length} unitCount={units.length} />
      ) : filtered.length === 0 ? (
        <EmptyStateNoMatches onClear={() => { setFilterStatus('all'); setFilterPriority('all'); setFilterPropertyId('all'); setSearch('') }} />
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => {
            const isEmergency = req.priority === 'emergency' && req.status !== 'resolved' && req.status !== 'closed'
            return (
              <button
                key={req.id}
                onClick={() => openDetail(req)}
                className={`w-full text-left bg-white rounded-xl p-4 border shadow-sm hover:shadow-md transition-all ${
                  isEmergency
                    ? 'border-l-4 border-l-red-500 border-y-red-100 border-r-red-100'
                    : 'border-gray-100 hover:border-brand-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isEmergency && (
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" strokeWidth={2} />
                      )}
                      <p className="font-semibold text-gray-900 truncate">{req.title}</p>
                    </div>
                    <p className="text-xs text-mute mt-0.5">{getUnitLabel(req.unit_id)}</p>
                    {req.description && (
                      <p className="text-sm text-gray-600 mt-1.5 line-clamp-2 leading-relaxed">{req.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-mute">
                      <span>{timeAgo(req.created_at)}</span>
                      {req.images && req.images.length > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <ImageIcon className="w-3 h-3" strokeWidth={1.75} />
                          {req.images.length}
                        </span>
                      )}
                      {req.ai_category && (
                        <span className="inline-flex items-center gap-1 text-brand-700">
                          <Sparkles className="w-3 h-3" strokeWidth={2} />
                          {catLabel(req.ai_category)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 items-end shrink-0">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize border ${PRIORITY_BADGE[req.priority]}`}>
                      {PRIORITY_LABEL[req.priority]}
                    </span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_BADGE[req.status]}`}>
                      {STATUS_LABEL[req.status]}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Detail / Update Modal ─────────────────────────────────── */}
      {selectedRequest && (
        <Modal
          open={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          title={selectedRequest.title}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{getUnitLabel(selectedRequest.unit_id)}</p>

            <div className="flex gap-2">
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${PRIORITY_BADGE[selectedRequest.priority]}`}>
                {PRIORITY_LABEL[selectedRequest.priority]}
              </span>
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_BADGE[selectedRequest.status]}`}>
                {STATUS_LABEL[selectedRequest.status]}
              </span>
            </div>

            {selectedRequest.description && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-gray-700 leading-relaxed">{selectedRequest.description}</p>
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

            {/* AI triage */}
            {sel && (
              <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-brand-800 inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={2} /> AI triage
                  </p>
                  {sel.ai_triaged_at && (
                    <button
                      type="button" onClick={() => handleTriage(sel.id)} disabled={triaging === sel.id}
                      className="text-[11px] font-medium text-brand-700 hover:text-brand-800 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      {triaging === sel.id && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />} Re-run
                    </button>
                  )}
                </div>
                {sel.ai_triaged_at ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {sel.ai_category && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white border border-brand-200 text-brand-800">
                          {catLabel(sel.ai_category)}
                        </span>
                      )}
                      {sel.ai_suggested_priority && (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize border ${PRIORITY_BADGE[sel.ai_suggested_priority]}`}>
                          Suggests {PRIORITY_LABEL[sel.ai_suggested_priority]}
                        </span>
                      )}
                      {sel.ai_suggested_priority && sel.ai_suggested_priority !== sel.priority && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 border border-amber-200 text-amber-800">
                          differs from current ({PRIORITY_LABEL[sel.priority]})
                        </span>
                      )}
                    </div>
                    {sel.ai_summary && <p className="text-sm text-ink">{sel.ai_summary}</p>}
                    {sel.ai_recommendation && <p className="text-xs text-mute leading-relaxed">{sel.ai_recommendation}</p>}
                    <p className="text-[10px] text-mute">AI-generated guidance — advisory only.</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-mute">Not triaged yet.</p>
                    <button
                      type="button" onClick={() => handleTriage(sel.id)} disabled={triaging === sel.id}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      {triaging === sel.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />}
                      Run AI triage
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Update request</p>

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

              <FormField label="Notes for tenant">
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Add a note visible to the tenant…"
                />
              </FormField>

              {/* Cost capture → optional Repairs expense */}
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Cost (optional)">
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    value={cost} onChange={(e) => setCost(e.target.value)}
                  />
                </FormField>
                <FormField label="Vendor (optional)">
                  <input
                    type="text" placeholder="e.g. ABC Plumbing"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    value={vendor} onChange={(e) => setVendor(e.target.value)}
                  />
                </FormField>
              </div>
              {selectedRequest.expense_id ? (
                <p className="text-xs text-emerald-700">✓ Logged as a Repairs expense.</p>
              ) : cost.trim() && Number(cost) > 0 ? (
                <label className="flex items-start gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox" checked={logExpense} onChange={(e) => setLogExpense(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Log {formatUsdCents(Number(cost))} as a <strong>Repairs</strong> expense on this property — flows into Expenses &amp; Schedule E.</span>
                </label>
              ) : null}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedRequest(null)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={updating === selectedRequest.id}
                className="flex-1 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {updating === selectedRequest.id ? 'Saving…' : 'Save changes'}
              </button>
            </div>

            <p className="text-xs text-gray-500 text-center">
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

// ── Subcomponents ────────────────────────────────────────────────────

// Tones use full static class strings (no dynamic `md:${x}` interpolation,
// since Tailwind's JIT only generates classes it can see in source).
const TONES = {
  amber:   { card: 'md:bg-white md:border-amber-200',   activeBg: 'bg-amber-50',   iconBg: 'bg-amber-50',   iconText: 'text-amber-700',   value: 'text-amber-700' },
  blue:    { card: 'md:bg-white md:border-blue-200',    activeBg: 'bg-blue-50',    iconBg: 'bg-blue-50',    iconText: 'text-blue-700',    value: 'text-blue-700' },
  red:     { card: 'md:bg-red-50 md:border-red-200',    activeBg: 'bg-red-100',    iconBg: 'bg-red-100',    iconText: 'text-red-700',     value: 'text-red-700' },
  emerald: { card: 'md:bg-white md:border-emerald-200', activeBg: 'bg-emerald-50', iconBg: 'bg-emerald-50', iconText: 'text-emerald-700', value: 'text-emerald-700' },
  gray:    { card: 'md:bg-white md:border-gray-200',    activeBg: 'bg-gray-100',   iconBg: 'bg-gray-50',    iconText: 'text-gray-500',    value: 'text-gray-500' },
} as const

function StatTile({ Icon, label, shortLabel, value, tone, onClick, active }: {
  Icon: typeof Wrench
  label: string
  shortLabel?: string        // displayed on mobile where horizontal room is tight
  value: number
  tone: keyof typeof TONES
  onClick?: () => void
  active?: boolean           // visually emphasize when the related filter is on
}) {
  const t = TONES[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-2 py-3 md:p-4 md:rounded-xl md:border transition-colors ${t.card} ${active ? t.activeBg : ''} ${onClick ? 'hover:bg-gray-50' : 'cursor-default'}`}
    >
      <div className="flex md:items-start md:justify-between flex-col md:flex-row gap-1">
        <div className="min-w-0">
          <p className="text-[10px] md:text-[11px] uppercase tracking-wider text-mute font-semibold truncate">
            <span className="md:hidden">{shortLabel ?? label}</span>
            <span className="hidden md:inline">{label}</span>
          </p>
          <p className={`text-xl md:text-3xl font-bold md:mt-1 tabular-nums ${t.value}`}>{value}</p>
        </div>
        <div className={`hidden md:flex w-9 h-9 rounded-lg items-center justify-center ${t.iconBg} ${t.iconText}`}>
          <Icon className="w-4 h-4" strokeWidth={1.75} />
        </div>
      </div>
    </button>
  )
}

function EmptyStateNoRequests({ propertyCount, unitCount }: { propertyCount: number; unitCount: number }) {
  // Context-aware empty state — explains *why* there's nothing yet
  let title: string
  let body: string
  if (propertyCount === 0) {
    title = 'Add a property first'
    body  = 'Maintenance requests come from your tenants. Add a property and unit, sign a lease, and your tenants can start submitting requests from their portal.'
  } else if (unitCount === 0) {
    title = 'Add a unit to start tracking maintenance'
    body  = 'You have a property set up — add a unit, lease it to a tenant, and any maintenance issues they report will land here.'
  } else {
    title = 'No maintenance requests yet'
    body  = 'When tenants submit requests from their portal, they show up here in priority order. Emergency requests get a red border and float to the top.'
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
      <div className="w-14 h-14 mx-auto mb-4 bg-brand-50 rounded-2xl flex items-center justify-center">
        <Wrench className="w-7 h-7 text-brand-600" strokeWidth={1.5} />
      </div>
      <p className="font-semibold text-gray-700">{title}</p>
      <p className="text-sm text-mute mt-2 max-w-md mx-auto leading-relaxed">{body}</p>
    </div>
  )
}

function EmptyStateNoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
      <div className="w-14 h-14 mx-auto mb-4 bg-gray-50 rounded-2xl flex items-center justify-center">
        <Search className="w-7 h-7 text-mute" strokeWidth={1.5} />
      </div>
      <p className="font-semibold text-gray-700">No requests match your filters</p>
      <p className="text-sm text-mute mt-2">Try widening the status or priority filter, or clearing the search.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
      >
        Clear all filters
      </button>
    </div>
  )
}

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
