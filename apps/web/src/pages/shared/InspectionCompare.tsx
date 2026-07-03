// Move-in vs move-out comparison.
//
// Mounted under both the manager and tenant layouts at
// `lease/:leaseId/inspection-compare`. Pulls both inspections for the lease,
// lines up each room+item by key, and shows the starting condition next to the
// ending condition — photos side by side — flagging where the condition got
// worse. This is what makes a deposit deduction defensible (or disputable):
// only damage beyond ordinary wear and tear is chargeable.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import type { Inspection, ChecklistItem, ItemCondition } from '@findstoop/shared/hooks/useInspection'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Loader2, Camera, TrendingDown, Scale } from 'lucide-react'
import type { PhotoHashRecord } from '../../lib/photoIntegrity'
import { fetchPhotoHashRecords } from '../../lib/photoIntegrityStore'
import PhotoVerifyBadge from '../../components/shared/PhotoVerifyBadge'

const CONDITION_LABEL: Record<string, string> = {
  excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor', damaged: 'Damaged',
}
const CONDITION_CLS: Record<string, string> = {
  excellent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  good:      'bg-blue-50 text-blue-700 border-blue-200',
  fair:      'bg-amber-50 text-amber-700 border-amber-200',
  poor:      'bg-orange-50 text-orange-700 border-orange-200',
  damaged:   'bg-red-50 text-red-700 border-red-200',
}
// Higher = better condition. Used to detect a decline from move-in → move-out.
const RANK: Record<string, number> = { excellent: 4, good: 3, fair: 2, poor: 1, damaged: 0 }

function worsened(from: ItemCondition, to: ItemCondition): boolean {
  if (!from || !to) return false
  return RANK[to] < RANK[from]
}

interface RowItem { key: string; name: string; from: ChecklistItem | null; to: ChecklistItem | null }
interface RowRoom { name: string; items: RowItem[] }

export default function InspectionCompare() {
  const { leaseId } = useParams<{ leaseId: string }>()
  const { profile } = useAuth()
  const role: 'manager' | 'tenant' = profile?.role === 'tenant' ? 'tenant' : 'manager'

  const [moveIn, setMoveIn]   = useState<Inspection | null>(null)
  const [moveOut, setMoveOut] = useState<Inspection | null>(null)
  const [urls, setUrls]       = useState<Record<string, string>>({})
  const [hashRecords, setHashRecords] = useState<Record<string, PhotoHashRecord>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!leaseId) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .eq('lease_id', leaseId)
        .in('type', ['move_in', 'move_out'])
      if (cancelled) return
      if (error) { setError(error.message); setLoading(false); return }
      const list = (data ?? []) as Inspection[]
      const mi = list.find((i) => i.type === 'move_in') ?? null
      const mo = list.find((i) => i.type === 'move_out') ?? null
      setMoveIn(mi)
      setMoveOut(mo)

      // Pre-sign every photo across both inspections in one batch.
      const paths = [mi, mo].flatMap((insp) =>
        insp?.checklist_data?.rooms?.flatMap((r) => r.items.flatMap((it) => it.photos)) ?? [])
      if (paths.length > 0) {
        // Signed URLs for display + tamper-evident hash records (photos with a
        // record get a lazy "Verify" badge; legacy photos just have no badge).
        const [{ data: signed }, records] = await Promise.all([
          supabase.storage.from('inspection-photos').createSignedUrls(paths, 3600),
          fetchPhotoHashRecords(paths),
        ])
        if (!cancelled) {
          if (signed) {
            const map: Record<string, string> = {}
            signed.forEach((s, i) => { if (s.signedUrl) map[paths[i]] = s.signedUrl })
            setUrls(map)
          }
          setHashRecords(records)
        }
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [leaseId])

  // Line up rooms by name and items by key, using the union of whatever each
  // side recorded so nothing is dropped if the templates ever diverge.
  const rooms: RowRoom[] = useMemo(() => {
    const byName = new Map<string, RowRoom>()
    const ingest = (insp: Inspection | null, side: 'from' | 'to') => {
      insp?.checklist_data?.rooms?.forEach((room) => {
        let row = byName.get(room.name)
        if (!row) { row = { name: room.name, items: [] }; byName.set(room.name, row) }
        room.items.forEach((item) => {
          let ri = row!.items.find((x) => x.key === item.key)
          if (!ri) { ri = { key: item.key, name: item.name, from: null, to: null }; row!.items.push(ri) }
          ri[side] = item
        })
      })
    }
    ingest(moveIn, 'from')
    ingest(moveOut, 'to')
    return Array.from(byName.values())
  }, [moveIn, moveOut])

  const declines = useMemo(
    () => rooms.flatMap((r) => r.items).filter((i) => worsened(i.from?.condition ?? null, i.to?.condition ?? null)).length,
    [rooms],
  )

  const backHref = role === 'manager'
    ? leaseId ? `/manager/review-lease/${leaseId}` : '/manager/leases'
    : '/tenant/dashboard'

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-mute"><Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} /></div>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-6 pb-20">
      <Link to={backHref} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink mb-4">
        <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to lease
      </Link>

      <header className="mb-5">
        <h1 className="text-xl font-bold text-ink">Move-in vs move-out</h1>
        <p className="text-sm text-mute mt-1">
          The condition at the start of the lease next to the condition at the end. Only damage beyond
          ordinary wear and tear can be charged against the deposit.
        </p>
      </header>

      {error && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      {!moveOut ? (
        <EmptyCard
          title="No move-out inspection yet"
          body={moveIn
            ? 'A move-in inspection is on file, but the move-out walk-through hasn’t been started. Once it exists, this page lines them up side by side.'
            : 'Neither a move-in nor a move-out inspection has been recorded for this lease yet.'}
        />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <Stat label="Rooms compared" value={String(rooms.length)} />
            <Stat label="Items" value={String(rooms.reduce((n, r) => n + r.items.length, 0))} />
            <Stat label="Show more wear" value={String(declines)} highlight={declines > 0} />
          </div>

          {declines > 0 && (
            <div className="mb-5 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
              <Scale className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" strokeWidth={1.75} />
              <p className="text-sm text-amber-900">
                {declines} item{declines === 1 ? '' : 's'} declined in condition. Judge each one against ordinary
                wear and tear before charging the deposit — faded paint, worn carpet, and routine cleaning generally aren’t chargeable.
              </p>
            </div>
          )}

          <div className="space-y-6">
            {rooms.map((room) => (
              <section key={room.name}>
                <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-2">{room.name}</h2>
                <div className="space-y-2">
                  {room.items.map((item) => {
                    const decl = worsened(item.from?.condition ?? null, item.to?.condition ?? null)
                    return (
                      <div key={item.key} className={`rounded-xl border p-3 ${decl ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200 bg-white'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm font-semibold text-ink flex-1">{item.name}</p>
                          {decl && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                              <TrendingDown className="w-3.5 h-3.5" strokeWidth={2} /> More wear
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Side label="Move-in" item={item.from} urls={urls} hashRecords={hashRecords} />
                          <Side label="Move-out" item={item.to} urls={urls} hashRecords={hashRecords} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          {/* Meter readings */}
          {(moveIn?.checklist_data?.meter_readings || moveOut?.checklist_data?.meter_readings) && (
            <section className="mt-6">
              <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-2">Meter readings</h2>
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="grid grid-cols-3 gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wide text-mute bg-gray-50">
                  <span>Meter</span><span>Move-in</span><span>Move-out</span>
                </div>
                {(['electric', 'gas', 'water'] as const).map((m) => (
                  <div key={m} className="grid grid-cols-3 gap-2 px-3 py-2 text-sm border-t border-gray-100">
                    <span className="capitalize text-mute">{m}</span>
                    <span className="text-ink">{moveIn?.checklist_data?.meter_readings?.[m] || '—'}</span>
                    <span className="text-ink">{moveOut?.checklist_data?.meter_readings?.[m] || '—'}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Side({ label, item, urls, hashRecords }: {
  label: string
  item: ChecklistItem | null
  urls: Record<string, string>
  hashRecords: Record<string, PhotoHashRecord>
}) {
  const cond = item?.condition
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-mute mb-1">{label}</p>
      {cond ? (
        <span className={`inline-block text-[11px] font-medium rounded-full border px-2 py-0.5 ${CONDITION_CLS[cond]}`}>
          {CONDITION_LABEL[cond]}
        </span>
      ) : (
        <span className="text-[11px] text-mute">Not recorded</span>
      )}
      {item?.notes && <p className="text-xs text-mute mt-1.5">{item.notes}</p>}
      {item && item.photos.length > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap items-start">
          {item.photos.map((path) => (
            <div key={path} className="flex flex-col gap-1">
              {urls[path]
                ? <a href={urls[path]} target="_blank" rel="noopener noreferrer" className="block w-14 h-14 rounded-lg overflow-hidden border border-gray-200">
                    <img src={urls[path]} alt="" className="w-full h-full object-cover" />
                  </a>
                : <div className="w-14 h-14 rounded-lg border border-gray-200 bg-gray-100 flex items-center justify-center"><Camera className="w-4 h-4 text-mute-400" strokeWidth={1.5} /></div>}
              <PhotoVerifyBadge record={hashRecords[path]} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 border ${highlight ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
      <p className="text-[11px] uppercase tracking-wide text-mute">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${highlight ? 'text-amber-700' : 'text-ink'}`}>{value}</p>
    </div>
  )
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-8 text-center">
      <Camera className="w-8 h-8 mx-auto text-mute-400 mb-2" strokeWidth={1.5} />
      <p className="font-semibold text-ink">{title}</p>
      <p className="text-sm text-mute mt-1 max-w-md mx-auto">{body}</p>
    </div>
  )
}
