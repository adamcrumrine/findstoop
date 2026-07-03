// Seasonal maintenance autopilot — the property's climate-aware preventive
// schedule with one-tap tenant delegation.
//
// Which tasks apply (and when) is pure logic in lib/seasonalMaintenance.ts;
// this card renders the current + upcoming tasks for the season and wires the
// actions:
//   • Tenant-friendly tasks → "Ask a tenant": sends the templated request
//     through the existing messaging machinery (find_or_create_direct_
//     conversation + messages insert) and records 'delegated' for the season.
//   • Pro tasks → link to the existing expense capture to log the cost.
//   • Mark done / dismiss for the season → seasonal_task_events upsert
//     (one row per property + task + occurrence; RLS scopes to the manager).

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck2, Check, ChevronDown, Loader2, Send, Undo2, Wallet, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { findOrCreateDirectConversation, sendMessage } from '@findstoop/shared/api/messages'
import {
  seasonalSchedule, isTenantFriendly, isProTask, tenantAskMessage,
  type SeasonalTaskOccurrence,
} from '../../lib/seasonalMaintenance'

// Structural props — only what this card needs, so it stays decoupled from
// PropertyDetail's own types.
interface CardProperty { id: string; name: string; state: string }
interface CardUnit { id: string; unit_number: string }
interface CardTenantProfile { id: string; full_name?: string | null; email?: string | null }
interface CardLease {
  id: string
  unit_id: string
  status: string
  tenant_id: string
  profile?: CardTenantProfile | null
  all_tenants?: CardTenantProfile[]
}

interface TaskEvent { task_id: string; occurrence: string; status: 'done' | 'dismissed' | 'delegated' }

interface TenantOption { tenantId: string; name: string; unitNumber: string }

export default function SeasonalMaintenanceCard({ property, units, leases }: {
  property: CardProperty
  units: CardUnit[]
  leases: CardLease[]
}) {
  const { user } = useAuth()
  const now = new Date()
  const schedule = useMemo(
    () => seasonalSchedule(property.state, now.getFullYear(), now.getMonth() + 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [property.state],
  )

  const [events, setEvents] = useState<Map<string, TaskEvent>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [pickerKey, setPickerKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('seasonal_task_events')
        .select('task_id, occurrence, status')
        .eq('property_id', property.id)
      if (cancelled) return
      const map = new Map<string, TaskEvent>()
      for (const e of (data ?? []) as TaskEvent[]) map.set(`${e.task_id}:${e.occurrence}`, e)
      setEvents(map)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [property.id])

  // Tenants on active leases, with their unit — the delegation candidates.
  const tenantOptions: TenantOption[] = useMemo(() => {
    const unitNoById = new Map(units.map((u) => [u.id, u.unit_number]))
    const seen = new Set<string>()
    const out: TenantOption[] = []
    for (const l of leases) {
      if (l.status !== 'active') continue
      const people = (l.all_tenants && l.all_tenants.length > 0)
        ? l.all_tenants
        : l.profile ? [l.profile] : []
      for (const p of people) {
        const key = `${p.id}:${l.unit_id}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          tenantId: p.id,
          name: p.full_name ?? p.email ?? 'Tenant',
          unitNumber: unitNoById.get(l.unit_id) ?? '—',
        })
      }
    }
    return out
  }, [leases, units])

  const keyOf = (o: SeasonalTaskOccurrence) => `${o.task.id}:${o.occurrence}`

  const recordEvent = async (o: SeasonalTaskOccurrence, status: TaskEvent['status']) => {
    const { error } = await supabase.from('seasonal_task_events').upsert({
      property_id: property.id,
      task_id: o.task.id,
      occurrence: o.occurrence,
      status,
      created_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'property_id,task_id,occurrence' })
    if (error) throw new Error(error.message)
    setEvents((prev) => {
      const next = new Map(prev)
      next.set(keyOf(o), { task_id: o.task.id, occurrence: o.occurrence, status })
      return next
    })
  }

  const clearEvent = async (o: SeasonalTaskOccurrence) => {
    const { error } = await supabase
      .from('seasonal_task_events')
      .delete()
      .eq('property_id', property.id)
      .eq('task_id', o.task.id)
      .eq('occurrence', o.occurrence)
    if (error) throw new Error(error.message)
    setEvents((prev) => {
      const next = new Map(prev)
      next.delete(keyOf(o))
      return next
    })
  }

  const handleMark = async (o: SeasonalTaskOccurrence, status: TaskEvent['status'] | 'clear') => {
    const k = keyOf(o)
    if (busyKey) return
    setBusyKey(k)
    try {
      if (status === 'clear') await clearEvent(o)
      else await recordEvent(o, status)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusyKey(null)
    }
  }

  const askTenant = async (o: SeasonalTaskOccurrence, option: TenantOption) => {
    if (!user?.id || busyKey) return
    const k = keyOf(o)
    setBusyKey(k)
    setPickerKey(null)
    try {
      const conv = await findOrCreateDirectConversation(option.tenantId)
      await sendMessage(user.id, conv.id, tenantAskMessage(o.task, property.name, option.unitNumber))
      await recordEvent(o, 'delegated')
      toast.success(`Asked ${option.name} — sent in Messages`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the message')
    } finally {
      setBusyKey(null)
    }
  }

  const onAskClick = (o: SeasonalTaskOccurrence) => {
    if (tenantOptions.length === 1) void askTenant(o, tenantOptions[0])
    else setPickerKey(pickerKey === keyOf(o) ? null : keyOf(o))
  }

  if (schedule.length === 0) return null

  const current = schedule.filter((o) => o.timing === 'current')
  const upcoming = schedule.filter((o) => o.timing === 'upcoming')

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 mt-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <div className="flex items-center gap-2">
          <CalendarCheck2 className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold text-ink">Seasonal maintenance</h2>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-mute bg-gray-100 px-2 py-0.5 rounded-full">
          {now.toLocaleDateString('en-US', { month: 'long' })}
        </span>
      </div>
      <p className="text-xs text-mute mb-3 leading-relaxed">
        Preventive tasks for this season, tuned to {property.state.trim().toUpperCase() || 'your state'}'s climate.
        Small jobs now beat emergency calls later.
      </p>

      {loading ? (
        <p className="text-sm text-mute inline-flex items-center gap-1.5">
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} /> Loading schedule…
        </p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {current.map((o) => (
              <TaskRow
                key={keyOf(o)}
                o={o}
                event={events.get(keyOf(o)) ?? null}
                busy={busyKey === keyOf(o)}
                pickerOpen={pickerKey === keyOf(o)}
                tenantOptions={tenantOptions}
                onAsk={() => onAskClick(o)}
                onPick={(opt) => void askTenant(o, opt)}
                onMark={(s) => void handleMark(o, s)}
              />
            ))}
          </ul>

          {upcoming.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-2">Coming up</p>
              <ul className="space-y-2.5">
                {upcoming.map((o) => (
                  <TaskRow
                    key={keyOf(o)}
                    o={o}
                    event={events.get(keyOf(o)) ?? null}
                    busy={busyKey === keyOf(o)}
                    pickerOpen={pickerKey === keyOf(o)}
                    tenantOptions={tenantOptions}
                    onAsk={() => onAskClick(o)}
                    onPick={(opt) => void askTenant(o, opt)}
                    onMark={(s) => void handleMark(o, s)}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ── One task row ─────────────────────────────────────────────────────────────

function TaskRow({ o, event, busy, pickerOpen, tenantOptions, onAsk, onPick, onMark }: {
  o: SeasonalTaskOccurrence
  event: TaskEvent | null
  busy: boolean
  pickerOpen: boolean
  tenantOptions: TenantOption[]
  onAsk: () => void
  onPick: (opt: TenantOption) => void
  onMark: (status: TaskEvent['status'] | 'clear') => void
}) {
  const settled = event?.status === 'done' || event?.status === 'dismissed'
  const canDelegate = isTenantFriendly(o.task) && tenantOptions.length > 0

  return (
    <li className={`border border-gray-100 rounded-xl px-3.5 py-3 ${settled ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {o.task.title}
            <WhoChip who={o.task.who} />
            {event?.status === 'done' && <StatusChip className="bg-green-50 text-green-700 border-green-200">Done</StatusChip>}
            {event?.status === 'dismissed' && <StatusChip className="bg-gray-50 text-mute border-gray-200">Skipped this season</StatusChip>}
            {event?.status === 'delegated' && <StatusChip className="bg-blue-50 text-blue-700 border-blue-200">Tenant asked</StatusChip>}
          </p>
          <p className="text-xs text-mute mt-1 leading-relaxed max-w-xl">{o.task.why}</p>
          <p className="text-[11px] text-mute mt-1">{o.task.cadence}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin text-mute" strokeWidth={1.75} />
          ) : settled ? (
            <ActionBtn title="Undo" onClick={() => onMark('clear')}>
              <Undo2 className="w-3.5 h-3.5" strokeWidth={1.75} /> Undo
            </ActionBtn>
          ) : (
            <>
              {canDelegate && event?.status !== 'delegated' && (
                <ActionBtn primary title="Send the request through Messages" onClick={onAsk}>
                  <Send className="w-3.5 h-3.5" strokeWidth={1.75} /> Ask a tenant
                  {tenantOptions.length > 1 && <ChevronDown className="w-3 h-3" strokeWidth={2} />}
                </ActionBtn>
              )}
              {isProTask(o.task) && (
                <Link
                  to="/manager/expenses"
                  className="inline-flex items-center gap-1 text-xs font-medium text-ink border border-gray-300 hover:bg-gray-50 px-2.5 py-1.5 rounded-lg"
                  title="Book a pro, then record the cost"
                >
                  <Wallet className="w-3.5 h-3.5" strokeWidth={1.75} /> Log as expense
                </Link>
              )}
              <ActionBtn title="Mark done" onClick={() => onMark('done')}>
                <Check className="w-3.5 h-3.5" strokeWidth={1.75} /> Done
              </ActionBtn>
              <ActionBtn title="Skip for this season" onClick={() => onMark('dismissed')}>
                <X className="w-3.5 h-3.5" strokeWidth={1.75} />
              </ActionBtn>
            </>
          )}
        </div>
      </div>

      {pickerOpen && !busy && (
        <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 bg-gray-50">
          {tenantOptions.map((t) => (
            <button
              key={`${t.tenantId}:${t.unitNumber}`}
              type="button"
              onClick={() => onPick(t)}
              className="w-full text-left text-xs px-3 py-2 hover:bg-white flex items-center justify-between"
            >
              <span className="font-medium text-ink">{t.name}</span>
              <span className="text-mute">Unit {t.unitNumber}</span>
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

function WhoChip({ who }: { who: 'tenant' | 'pro' | 'either' }) {
  const label = who === 'tenant' ? 'Tenant-friendly' : who === 'pro' ? 'Call a pro' : 'Tenant or pro'
  const cls = who === 'pro'
    ? 'bg-amber-50 text-amber-800 border-amber-200'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return <StatusChip className={cls}>{label}</StatusChip>
}

function StatusChip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`ml-2 align-middle inline-block text-[10px] font-semibold uppercase tracking-wide border rounded-full px-1.5 py-0.5 ${className}`}>
      {children}
    </span>
  )
}

function ActionBtn({ children, onClick, title, primary }: {
  children: React.ReactNode
  onClick: () => void
  title: string
  primary?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg ${
        primary
          ? 'text-white bg-brand-600 hover:bg-brand-700'
          : 'text-ink border border-gray-300 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}
