// Move-in / move-out inspection editor.
//
// Mounted at:
//   /manager/lease/:leaseId/inspection/:type
//   /tenant/lease/:leaseId/inspection/:type
//
// Same component, different role context — `useAuth().profile.role` decides
// whether the caller is the manager or tenant party. Both can edit until
// they personally sign; once both sign, the editor goes read-only and a
// banner offers the PDF link.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Loader2, ArrowLeft, ImageIcon, X, Check, ShieldCheck, Lock,
  ClipboardList, FileText,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import {
  useInspection, type InspectionType, type ChecklistData, type ChecklistItem,
  type ChecklistRoom, type ItemCondition,
} from '@findstoop/shared/hooks/useInspection'
import { supabase } from '../../lib/supabase'
import { verifyImageMagicBytes } from '../../lib/fileValidation'
import type { PhotoHashRecord } from '../../lib/photoIntegrity'
import { fetchPhotoHashRecords, recordInspectionPhotoHash } from '../../lib/photoIntegrityStore'
import PhotoVerifyBadge from '../../components/shared/PhotoVerifyBadge'
import ModalShell from '../../components/shared/ModalShell'

const CONDITIONS: { key: Exclude<ItemCondition, null>; label: string; cls: string }[] = [
  { key: 'excellent', label: 'Excellent', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'good',      label: 'Good',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'fair',      label: 'Fair',      cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'poor',      label: 'Poor',      cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  { key: 'damaged',   label: 'Damaged',   cls: 'bg-red-50 text-red-700 border-red-200' },
]

export default function InspectionEditor() {
  const { leaseId, type } = useParams<{ leaseId: string; type: InspectionType }>()
  const { profile } = useAuth()
  const role: 'manager' | 'tenant' = profile?.role === 'tenant' ? 'tenant' : 'manager'

  const { inspection, loading, saving, save, sign, start } = useInspection(leaseId, type as InspectionType)

  // Local working copy — we save on field blur, but also let the user
  // explicitly save via the floating bar so they can batch edits.
  const [localData, setLocalData] = useState<ChecklistData | null>(null)
  const [localNotes, setLocalNotes] = useState('')
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [signatureName, setSignatureName] = useState('')

  useEffect(() => {
    if (inspection) {
      setLocalData(inspection.checklist_data)
      setLocalNotes(role === 'manager' ? (inspection.manager_notes ?? '') : (inspection.tenant_notes ?? ''))
    }
  }, [inspection, role])

  // Tamper-evident photo fingerprints, keyed by storage path. Loaded once per
  // inspection; new uploads merge their record in as they're hashed. Photos
  // without a record (uploaded before fingerprinting) simply show no badge.
  const [hashRecords, setHashRecords] = useState<Record<string, PhotoHashRecord>>({})
  const inspectionId = inspection?.id
  useEffect(() => {
    if (!inspection) return
    let cancelled = false
    const paths = inspection.checklist_data.rooms.flatMap((r) => r.items.flatMap((i) => i.photos))
    if (paths.length === 0) return
    ;(async () => {
      const map = await fetchPhotoHashRecords(paths)
      if (!cancelled) setHashRecords((prev) => ({ ...map, ...prev }))
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId])

  // ── Whether the calling role can still edit ──────────────────────────
  const mySignedAt    = role === 'manager' ? inspection?.manager_signed_at : inspection?.tenant_signed_at
  const otherSignedAt = role === 'manager' ? inspection?.tenant_signed_at  : inspection?.manager_signed_at
  const canEdit = !mySignedAt && inspection?.state !== 'both_signed'

  // Every checklist item needs a condition pill before the tenant can sign.
  // Defaults to 'fair' on a freshly-started inspection, but if anyone has
  // cleared a pill we don't want the tenant locking in an incomplete record.
  const unratedCount = useMemo(() => {
    if (!localData) return 0
    let n = 0
    for (const room of localData.rooms) {
      for (const item of room.items) if (!item.condition) n++
    }
    return n
  }, [localData])
  const canSign = canEdit && (role !== 'tenant' || unratedCount === 0)

  // ── Mutators ─────────────────────────────────────────────────────────
  const setItem = (roomIdx: number, itemIdx: number, patch: Partial<ChecklistItem>) => {
    if (!localData) return
    const next = structuredClone(localData) as ChecklistData
    next.rooms[roomIdx].items[itemIdx] = { ...next.rooms[roomIdx].items[itemIdx], ...patch }
    setLocalData(next)
  }

  const setMeter = (key: 'electric' | 'gas' | 'water', value: string) => {
    if (!localData) return
    setLocalData({ ...localData, meter_readings: { ...localData.meter_readings, [key]: value } })
  }

  const setKeysHandover = (next: string[]) => {
    if (!localData) return
    setLocalData({ ...localData, keys_handover: next })
  }

  const saveAll = async () => {
    if (!localData) return
    const notesPatch = role === 'manager' ? { manager_notes: localNotes } : { tenant_notes: localNotes }
    await save({ checklist_data: localData, ...notesPatch })
    toast.success('Saved')
  }

  // ── Photo upload ──────────────────────────────────────────────────────
  const uploadPhoto = async (roomIdx: number, itemIdx: number, file: File) => {
    if (!inspection) return
    const mime = await verifyImageMagicBytes(file)
    if (!mime) { toast.error('Pick a real image (JPEG / PNG / HEIC)'); return }

    const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'jpg'
    const item = localData!.rooms[roomIdx].items[itemIdx]
    const path = `${inspection.lease_id}/${inspection.id}/${item.key}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('inspection-photos').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })
    if (error) { toast.error(error.message); return }

    // Fingerprint the exact bytes we just uploaded (SHA-256 via Web Crypto)
    // and record it server-side — the DB stamps the time and the row can
    // never be updated, so neither party can backdate or alter the record.
    const rec = await recordInspectionPhotoHash({
      leaseId: inspection.lease_id,
      inspectionId: inspection.id,
      storagePath: path,
      file,
    })
    if (rec) {
      setHashRecords((prev) => ({ ...prev, [path]: rec }))
    } else {
      // Non-fatal: the photo is saved, it just won't carry a verification badge.
      toast('Photo saved, but its verification fingerprint could not be recorded.')
    }

    setItem(roomIdx, itemIdx, { photos: [...item.photos, path] })
  }

  const removePhoto = (roomIdx: number, itemIdx: number, photoPath: string) => {
    const item = localData!.rooms[roomIdx].items[itemIdx]
    setItem(roomIdx, itemIdx, { photos: item.photos.filter((p) => p !== photoPath) })
    // We leave the file in storage — it's cheap, and lets the other party
    // verify what was there if the editing user changes their mind.
  }

  // ── No inspection yet: bootstrap ──────────────────────────────────────
  if (!loading && !inspection) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <BackLink role={role} leaseId={leaseId} />
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 bg-brand-50 rounded-2xl flex items-center justify-center">
            <ClipboardList className="w-7 h-7 text-brand-600" strokeWidth={1.5} />
          </div>
          <h1 className="text-lg font-semibold text-ink">
            Start the {type === 'move_in' ? 'move-in' : 'move-out'} checklist
          </h1>
          <p className="text-sm text-mute mt-2 max-w-md mx-auto">
            Walk through the unit room-by-room and rate the condition of each fixture.
            Both you and the {role === 'manager' ? 'tenant' : 'landlord'} will need to sign
            for the checklist to be locked into Documents.
          </p>
          <button
            type="button"
            onClick={async () => {
              const ok = await start()
              if (!ok) toast.error('Could not start the checklist')
            }}
            className="mt-5 inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg"
          >
            Start checklist
          </button>
        </div>
      </div>
    )
  }

  if (loading || !inspection || !localData) {
    return (
      <div className="flex items-center justify-center h-64 text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6 pb-32">
      <BackLink role={role} leaseId={leaseId} />

      <header className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-mute font-semibold">
            {type === 'move_in' ? 'Move-in' : 'Move-out'} checklist
          </p>
          <h1 className="text-2xl font-bold text-ink mt-1">Condition report</h1>
          <p className="text-sm text-mute mt-1">Walk room-by-room with the other party. Save as you go.</p>
        </div>
        <SignatureBadges inspection={inspection} />
      </header>

      {inspection.state === 'both_signed' && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
          <Check className="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" strokeWidth={2} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-900">Signed by both parties — locked.</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Open the PDF to print, share, or archive.
            </p>
          </div>
          <Link
            to={`/inspection-pdf/${inspection.id}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-emerald-300 text-emerald-800 bg-white hover:bg-emerald-100"
          >
            <FileText className="w-3.5 h-3.5" strokeWidth={2} />
            View PDF
          </Link>
        </div>
      )}

      {/* Rooms */}
      <div className="space-y-4">
        {localData.rooms.map((room, roomIdx) => (
          <RoomCard
            key={room.name}
            room={room}
            canEdit={canEdit}
            hashRecords={hashRecords}
            onItemChange={(itemIdx, patch) => setItem(roomIdx, itemIdx, patch)}
            onPhotoUpload={(itemIdx, file) => uploadPhoto(roomIdx, itemIdx, file)}
            onPhotoRemove={(itemIdx, photo) => removePhoto(roomIdx, itemIdx, photo)}
          />
        ))}
      </div>

      {/* Meter readings */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 mt-4">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-3">Meter readings (optional)</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {(['electric', 'gas', 'water'] as const).map((k) => (
            <div key={k}>
              <label className="block text-xs text-mute capitalize mb-1">{k}</label>
              <input
                type="text"
                disabled={!canEdit}
                value={localData.meter_readings[k]}
                onChange={(e) => setMeter(k, e.target.value)}
                placeholder={k === 'water' ? '12345 gal' : '12345 kWh'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm placeholder-mute focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-mute"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Keys handed over */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 mt-4">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-3">Keys + access</h2>
        <p className="text-xs text-mute mb-2">List every physical key, fob, or access code transferred.</p>
        <KeysList items={localData.keys_handover} canEdit={canEdit} onChange={setKeysHandover} />
      </section>

      {/* Role-specific notes */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 mt-4">
        <h2 className="text-xs uppercase tracking-wider text-mute font-semibold mb-2">
          {role === 'manager' ? 'Manager notes' : 'Tenant notes'}
        </h2>
        <textarea
          rows={4}
          disabled={!canEdit}
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          placeholder="Anything else worth recording — preexisting damage you want acknowledged, agreed touch-ups, etc."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm placeholder-mute focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50"
        />
        <p className="text-[11px] text-mute mt-1.5">
          Both notes appear in the signed PDF.
        </p>
      </section>

      {/* Floating action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <p className="text-xs text-mute">
            {canEdit
              ? role === 'tenant' && unratedCount > 0
                ? <><span className="text-amber-700 font-semibold">Rate all items to sign</span> · {unratedCount} remaining</>
                : otherSignedAt
                  ? <>The other party has signed. Add your changes and sign to lock.</>
                  : <>Save anytime. Sign when the walkthrough is complete.</>
              : mySignedAt
                ? <>You've signed{otherSignedAt ? ' and so has the other party.' : ' — waiting on the other party.'}</>
                : <>Locked.</>}
          </p>
          <div className="flex gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={saveAll}
                disabled={saving}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-ink hover:bg-gray-50 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setSignatureOpen(true)}
                disabled={!canSign}
                title={!canSign && role === 'tenant'
                  ? `Rate all ${unratedCount} remaining ${unratedCount === 1 ? 'item' : 'items'} before signing`
                  : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold"
              >
                <ShieldCheck className="w-4 h-4" strokeWidth={2} />
                Sign as {role}
              </button>
            )}
            {inspection.state === 'both_signed' && (
              <Link
                to={`/inspection-pdf/${inspection.id}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-semibold"
              >
                <FileText className="w-4 h-4" strokeWidth={2} />
                Open PDF
              </Link>
            )}
            {!canEdit && inspection.state !== 'both_signed' && (
              <div className="text-xs text-mute inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" strokeWidth={2} />
                Waiting on other party
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Signature modal */}
      {signatureOpen && (
        <SignatureModal
          role={role}
          onClose={() => setSignatureOpen(false)}
          onSign={async (name) => {
            // Save any unsaved edits first so the PDF reflects the latest state
            const notesPatch = role === 'manager' ? { manager_notes: localNotes } : { tenant_notes: localNotes }
            await save({ checklist_data: localData, ...notesPatch })
            await sign(role, name)
            setSignatureOpen(false)
            toast.success('Signed')
          }}
          defaultName={profile?.full_name ?? ''}
          signatureName={signatureName}
          setSignatureName={setSignatureName}
        />
      )}
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────

function BackLink({ role, leaseId }: { role: 'manager' | 'tenant'; leaseId: string | undefined }) {
  const href = role === 'manager'
    ? leaseId ? `/manager/review-lease/${leaseId}` : '/manager/leases'
    : '/tenant/dashboard'
  return (
    <Link to={href} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink mb-4">
      <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to lease
    </Link>
  )
}

function SignatureBadges({ inspection }: { inspection: { manager_signed_at: string | null; tenant_signed_at: string | null } }) {
  return (
    <div className="flex flex-col gap-1.5 text-[11px] shrink-0">
      <SigBadge label="Manager" signed={!!inspection.manager_signed_at} ts={inspection.manager_signed_at} />
      <SigBadge label="Tenant"  signed={!!inspection.tenant_signed_at}  ts={inspection.tenant_signed_at} />
    </div>
  )
}

function SigBadge({ label, signed, ts }: { label: string; signed: boolean; ts: string | null }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border font-medium ${
      signed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-mute border-gray-200'
    }`}>
      {signed ? <Check className="w-3 h-3" strokeWidth={2.5} /> : <span className="w-3 h-3 rounded-full border border-gray-300" />}
      {label} {signed && ts && <span className="opacity-70">· {new Date(ts).toLocaleDateString()}</span>}
    </div>
  )
}

function RoomCard({ room, canEdit, hashRecords, onItemChange, onPhotoUpload, onPhotoRemove }: {
  room: ChecklistRoom
  canEdit: boolean
  hashRecords: Record<string, PhotoHashRecord>
  onItemChange: (itemIdx: number, patch: Partial<ChecklistItem>) => void
  onPhotoUpload: (itemIdx: number, file: File) => void
  onPhotoRemove: (itemIdx: number, photo: string) => void
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
        <h2 className="text-sm font-semibold text-ink">{room.name}</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {room.items.map((item, i) => (
          <ItemRow
            key={item.key}
            item={item}
            canEdit={canEdit}
            hashRecords={hashRecords}
            onChange={(patch) => onItemChange(i, patch)}
            onPhotoAdd={(file) => onPhotoUpload(i, file)}
            onPhotoDelete={(photo) => onPhotoRemove(i, photo)}
          />
        ))}
      </div>
    </section>
  )
}

function ItemRow({ item, canEdit, hashRecords, onChange, onPhotoAdd, onPhotoDelete }: {
  item: ChecklistItem
  canEdit: boolean
  hashRecords: Record<string, PhotoHashRecord>
  onChange: (patch: Partial<ChecklistItem>) => void
  onPhotoAdd: (file: File) => void
  onPhotoDelete: (photo: string) => void
}) {
  const [showNotes, setShowNotes] = useState(!!item.notes)

  return (
    <div className="px-5 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm font-medium text-ink min-w-[140px]">{item.name}</p>
        <div className="flex gap-1 flex-wrap">
          {CONDITIONS.map((c) => {
            const active = item.condition === c.key
            return (
              <button
                key={c.key}
                type="button"
                disabled={!canEdit}
                aria-pressed={active}
                onClick={() => onChange({ condition: c.key })}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  active ? c.cls : 'bg-white text-mute border-gray-200 hover:border-gray-400'
                }`}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Notes + photo actions */}
      <div className="mt-2 flex items-center gap-3">
        {!showNotes && canEdit && (
          <button type="button" onClick={() => setShowNotes(true)} className="text-xs text-brand-600 hover:underline">
            + Add note
          </button>
        )}
        {canEdit && (
          <label className="text-xs text-brand-600 hover:underline cursor-pointer inline-flex items-center gap-1">
            <ImageIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
            Add photo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhotoAdd(f); e.currentTarget.value = '' }}
            />
          </label>
        )}
      </div>

      {(showNotes || item.notes) && (
        <textarea
          rows={2}
          disabled={!canEdit}
          value={item.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="e.g., scratch by stove, ~2 inches"
          className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm placeholder-mute focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50"
        />
      )}

      {item.photos.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap items-start">
          {item.photos.map((path) => (
            <div key={path} className="flex flex-col gap-1">
              <Thumb path={path} onRemove={canEdit ? () => onPhotoDelete(path) : undefined} />
              <PhotoVerifyBadge record={hashRecords[path]} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Thumb({ path, onRemove }: { path: string; onRemove?: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.storage.from('inspection-photos').createSignedUrl(path, 3600)
      if (!cancelled) setUrl(data?.signedUrl ?? null)
    })()
    return () => { cancelled = true }
  }, [path])
  return (
    <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
      {url
        ? <img src={url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-mute" /></div>}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white inline-flex items-center justify-center hover:bg-black/80"
          aria-label="Remove photo"
        >
          <X className="w-3 h-3" strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}

function KeysList({ items, canEdit, onChange }: { items: string[]; canEdit: boolean; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('')
  return (
    <>
      <ul className="space-y-1.5 mb-2">
        {items.length === 0 && <li className="text-xs text-mute italic">None recorded</li>}
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="flex-1 px-3 py-1.5 bg-gray-50 rounded-lg">{it}</span>
            {canEdit && (
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (draft.trim()) { onChange([...items, draft.trim()]); setDraft('') }
              }
            }}
            placeholder="e.g., Front door key x2, mailbox key x1, garage fob"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm placeholder-mute focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="button"
            onClick={() => { if (draft.trim()) { onChange([...items, draft.trim()]); setDraft('') } }}
            className="px-4 py-2 bg-ink text-white rounded-lg text-sm font-medium hover:bg-ink/90"
          >
            Add
          </button>
        </div>
      )}
    </>
  )
}

function SignatureModal({ role, onClose, onSign, defaultName, signatureName, setSignatureName }: {
  role: 'manager' | 'tenant'
  onClose: () => void
  onSign: (name: string) => Promise<void>
  defaultName: string
  signatureName: string
  setSignatureName: (s: string) => void
}) {
  const effectiveName = signatureName || defaultName

  const [submitting, setSubmitting] = useState(false)
  const handleSign = async () => {
    if (!effectiveName.trim()) return
    setSubmitting(true)
    await onSign(effectiveName.trim())
    setSubmitting(false)
  }

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-md" aria-label={`Sign as ${role}`}>
      <div className="p-6 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <h2 className="text-lg font-semibold text-ink">Sign as {role}</h2>
        <p className="text-sm text-mute mt-2 leading-relaxed">
          By signing, you confirm that the conditions recorded above accurately reflect the
          state of the unit at the time of the {role === 'manager' ? 'walkthrough' : 'inspection'}.
          You won't be able to edit your sections after signing.
        </p>
        <div className="mt-4">
          <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">
            Type your full name to sign
          </label>
          <input
            type="text"
            value={signatureName || defaultName}
            onChange={(e) => setSignatureName(e.target.value)}
            placeholder={defaultName || 'Jane Smith'}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm placeholder-mute focus:outline-none focus:ring-2 focus:ring-brand-500"
            autoFocus
          />
        </div>
        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-mute hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSign}
            disabled={submitting || !effectiveName.trim()}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4" strokeWidth={2} />
            {submitting ? 'Signing…' : 'Sign'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// Helper for components that may not exist in this file's import set yet —
// suppress unused import warnings when not consumed by certain branches.
export type { InspectionType }
const _unused = useMemo
void _unused
