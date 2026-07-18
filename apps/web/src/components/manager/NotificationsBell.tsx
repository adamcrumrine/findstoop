// Top-of-header to-do bell. Aggregates action-required items across the
// manager surfaces (move-in/out checklists, leases waiting on the
// manager's countersignature, …) and surfaces them under a single bell
// icon. A red dot appears when there's anything outstanding.
//
// The panel is intentionally simple — a flat list of to-dos with a clear
// "act on it" link per row. We don't try to be a notification *feed* (no
// read/unread state, no archival) — these are real outstanding tasks.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Bell, ClipboardList, FileSignature, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'

interface InspectionTodo {
  kind: 'inspection'
  id: string
  lease_id: string
  type: 'move_in' | 'move_out'
  state: 'draft' | 'manager_signed' | 'tenant_signed' | 'both_signed'
  updated_at: string
  property_label: string
  tenant_name: string
}

interface LeaseSignatureTodo {
  kind: 'lease_signature'
  id: string  // lease id
  property_label: string
  tenant_name: string
  // 'tenant_signed_awaiting_you' = tenant has signed; manager has not.
  // 'sent_no_action'              = sent but neither has signed yet (rare;
  //                                  surfaces stalled invites so they can
  //                                  be chased).
  variant: 'tenant_signed_awaiting_you' | 'sent_no_action'
  updated_at: string
}

type Todo = InspectionTodo | LeaseSignatureTodo

export default function NotificationsBell() {
  const { user } = useAuth()
  const managerId = user?.id
  const [todos, setTodos] = useState<Todo[]>([])
  const [open, setOpen] = useState(false)
  // Portal-positioned panel. The panel is anchored to either top OR
  // bottom — anchoring to bottom when placed above the bell ensures the
  // panel hugs the bell instead of floating near the viewport top when
  // it has lots of room to grow upward.
  const PANEL_W = 360
  const [anchor, setAnchor] = useState<{ top?: number; bottom?: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const reposition = () => {
      const r = buttonRef.current?.getBoundingClientRect()
      if (!r) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const panelW = Math.min(PANEL_W, vw - 24)
      // Vertical — prefer below the bell; if there's < 240px below AND
      // more room above, flip and anchor the panel's BOTTOM edge just
      // above the bell so the panel grows upward from the bell rather
      // than floating near the top of the viewport.
      const spaceBelow = vh - r.bottom
      const placeAbove = spaceBelow < 240 && r.top > spaceBelow
      // Horizontal — align panel's right edge to the bell's right edge.
      // If that would push the panel off-screen left, anchor to the
      // bell's left edge instead. Then clamp into the viewport.
      let left = r.right - panelW
      if (left < 12) left = Math.min(r.left, vw - panelW - 12)
      left = Math.max(12, Math.min(left, vw - panelW - 12))
      setAnchor(
        placeAbove
          ? { bottom: vh - r.top + 8, left }
          : { top: r.bottom + 8, left }
      )
    }
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  // Outside-tap + Escape close the panel.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (buttonRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Fetch to-dos. Re-runs when managerId resolves; no polling — refresh
  // on next page nav / mount is acceptable for this volume.
  useEffect(() => {
    if (!managerId) { setTodos([]); return }
    let cancelled = false
    ;(async () => {
      // Manager's leases (id + tenant + unit + property) so both queries
      // below can join through.
      const { data: leaseRows } = await supabase
        .from('leases')
        .select(`
          id, status, sent_for_signature_at, signed_at,
          tenant:profiles!leases_tenant_id_fkey ( full_name, email ),
          unit:units!leases_unit_id_fkey (
            unit_number,
            property:properties!units_property_id_fkey ( name, manager_id )
          )
        `)
      type LeaseLite = {
        id: string
        status: string
        sent_for_signature_at: string | null
        signed_at: string | null
        tenant: { full_name: string | null; email: string | null } | null
        unit: { unit_number: string; property: { name: string | null; manager_id: string } | null } | null
      }
      const leases = ((leaseRows ?? []) as unknown as LeaseLite[])
        .filter((l) => l.unit?.property?.manager_id === managerId)

      const leaseById = new Map(leases.map((l) => [l.id, l]))
      const propLabel = (l: LeaseLite | undefined) =>
        l?.unit
          ? `${l.unit.property?.name ?? 'Property'} · Unit ${l.unit.unit_number}`
          : 'Lease'
      const tenantLabel = (l: LeaseLite | undefined) =>
        l?.tenant?.full_name ?? l?.tenant?.email ?? 'Tenant'

      const leaseIds = leases.map((l) => l.id)
      if (leaseIds.length === 0) { if (!cancelled) setTodos([]); return }

      // Outstanding inspections — anything that isn't both_signed counts.
      const { data: inspections } = await supabase
        .from('inspections')
        .select('id, lease_id, type, state, updated_at')
        .in('lease_id', leaseIds)
        .neq('state', 'both_signed')
        .order('updated_at', { ascending: false })

      // Leases that need the manager to act:
      //   tenant signed but manager hasn't  → countersign now
      //   sent_for_signature, neither signed → chase
      const { data: signaturesData } = await supabase
        .from('lease_signatures')
        .select('lease_id, signer_role')
        .in('lease_id', leaseIds)
      const signedByLease = new Map<string, Set<string>>()
      for (const row of ((signaturesData ?? []) as Array<{ lease_id: string; signer_role: string }>)) {
        if (!signedByLease.has(row.lease_id)) signedByLease.set(row.lease_id, new Set())
        signedByLease.get(row.lease_id)!.add(row.signer_role)
      }

      const inspectionTodos: InspectionTodo[] = ((inspections ?? []) as Array<{
        id: string; lease_id: string; type: 'move_in' | 'move_out';
        state: InspectionTodo['state']; updated_at: string
      }>).map((r) => ({
        kind: 'inspection',
        id: r.id,
        lease_id: r.lease_id,
        type: r.type,
        state: r.state,
        updated_at: r.updated_at,
        property_label: propLabel(leaseById.get(r.lease_id)),
        tenant_name: tenantLabel(leaseById.get(r.lease_id)),
      }))

      const leaseTodos: LeaseSignatureTodo[] = []
      for (const l of leases) {
        if (l.signed_at) continue
        if (l.status !== 'pending') continue
        const signed = signedByLease.get(l.id) ?? new Set<string>()
        const tenantSigned = signed.has('tenant')
        const managerSigned = signed.has('manager') || signed.has('admin')
        if (tenantSigned && !managerSigned) {
          leaseTodos.push({
            kind: 'lease_signature',
            id: l.id,
            property_label: propLabel(l),
            tenant_name: tenantLabel(l),
            variant: 'tenant_signed_awaiting_you',
            updated_at: l.sent_for_signature_at ?? new Date().toISOString(),
          })
        } else if (l.sent_for_signature_at && !tenantSigned) {
          // Only show stalled invites that have been sitting > 3 days, so
          // the bell doesn't light up the instant a lease is sent.
          const ageDays = (Date.now() - new Date(l.sent_for_signature_at).getTime()) / 86400000
          if (ageDays >= 3) {
            leaseTodos.push({
              kind: 'lease_signature',
              id: l.id,
              property_label: propLabel(l),
              tenant_name: tenantLabel(l),
              variant: 'sent_no_action',
              updated_at: l.sent_for_signature_at,
            })
          }
        }
      }

      if (cancelled) return
      // Signature to-dos first (more urgent), then inspections, newest first.
      setTodos([...leaseTodos, ...inspectionTodos].sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      ))
    })()
    return () => { cancelled = true }
  }, [managerId])

  const count = todos.length

  // Panel rendered through a portal anchored to document.body so it can
  // escape any ancestor with overflow:hidden / stacking context (e.g. the
  // mobile header / main column wrappers in ManagerLayout). z-50 +
  // backdrop sit above every other layout layer.
  const panel = open ? createPortal(
    <>
      <div
        className="fixed inset-0 z-[60]"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        className="fixed z-[70] w-[min(360px,calc(100vw-1.5rem))] max-h-[min(70vh,calc(100dvh-5.5rem))] overflow-y-auto overscroll-contain bg-white rounded-xl border border-gray-200 shadow-xl"
        style={anchor ? anchor : { top: 56, left: 12 }}
      >
        <div className="px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <p className="text-sm font-semibold text-ink">To-dos</p>
          <p className="text-[11px] text-mute">
            {count === 0 ? "You're all caught up." : `${count} item${count === 1 ? '' : 's'} need attention.`}
          </p>
        </div>
        {count === 0 ? (
          <div className="px-4 py-10 text-center text-mute text-sm">Nothing outstanding 🎉</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {todos.map((t) => <TodoRow key={`${t.kind}-${t.id}`} todo={t} onNavigate={() => setOpen(false)} />)}
          </ul>
        )}
      </div>
    </>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 -mr-1 rounded-lg text-mute hover:text-ink hover:bg-gray-50 transition-colors"
        aria-label={count > 0 ? `${count} pending to-do${count === 1 ? '' : 's'}` : 'No outstanding to-dos'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell className="w-5 h-5" strokeWidth={1.75} />
        {count > 0 && (
          <span
            className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white"
            aria-hidden="true"
          />
        )}
      </button>
      {panel}
    </>
  )
}

function TodoRow({ todo, onNavigate }: { todo: Todo; onNavigate: () => void }) {
  if (todo.kind === 'inspection') {
    const stateLabel =
      todo.state === 'draft'           ? 'Draft — needs completion' :
      todo.state === 'manager_signed'  ? 'Awaiting tenant signature' :
      todo.state === 'tenant_signed'   ? 'Awaiting your signature' :
                                         'In progress'
    return (
      <li>
        <Link
          to={`/manager/lease/${todo.lease_id}/inspection/${todo.type}`}
          onClick={onNavigate}
          className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
            <ClipboardList className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink truncate">
              {todo.type === 'move_in' ? 'Move-in' : 'Move-out'} — {todo.property_label}
            </p>
            <p className="text-xs text-mute truncate">{todo.tenant_name}</p>
            <p className="text-[11px] text-amber-700 mt-0.5">{stateLabel}</p>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-mute shrink-0 mt-1" strokeWidth={1.75} />
        </Link>
      </li>
    )
  }
  const variantLabel = todo.variant === 'tenant_signed_awaiting_you'
    ? 'Awaiting your countersignature'
    : 'Sent — no action yet'
  return (
    <li>
      <Link
        to={`/manager/review-lease/${todo.id}`}
        onClick={onNavigate}
        className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 inline-flex items-center justify-center shrink-0">
          <FileSignature className="w-4 h-4" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink truncate">Lease — {todo.property_label}</p>
          <p className="text-xs text-mute truncate">{todo.tenant_name}</p>
          <p className="text-[11px] text-amber-700 mt-0.5">{variantLabel}</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-mute shrink-0 mt-1" strokeWidth={1.75} />
      </Link>
    </li>
  )
}
