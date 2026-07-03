// Print-friendly inspection report.
//
// Mounted standalone at `/inspection-pdf/:id` — no sidebar layout. Same
// access rules as the editor: anyone party to the lease (manager, tenant,
// admin) can render it. The page is styled for window.print() → save as PDF.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, ShieldCheck, Printer, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Inspection } from '@findstoop/shared/hooks/useInspection'
import { BRAND } from '../../lib/brand'
import { capturedDateTime, verifyBytesAgainstRecord } from '../../lib/photoIntegrity'
import { fetchPhotoHashRecords } from '../../lib/photoIntegrityStore'

interface LeaseCtx {
  unit_number: string
  property_name: string
  property_address: string
  property_city: string
  property_state: string
  property_zip: string
  start_date: string
  end_date: string
  rent_amount: number
  tenant_name: string | null
  manager_name: string | null
}

const CONDITION_LABEL: Record<string, string> = {
  excellent: 'Excellent',
  good:      'Good',
  fair:      'Fair',
  poor:      'Poor',
  damaged:   'Damaged',
}

const CONDITION_CLS: Record<string, string> = {
  excellent: 'text-emerald-700',
  good:      'text-blue-700',
  fair:      'text-amber-700',
  poor:      'text-orange-700',
  damaged:   'text-red-700',
}

// Per-photo integrity stamp printed under each image. We only claim
// "verified" after actually re-hashing the stored bytes against the
// fingerprint recorded at upload — never on trust.
interface PhotoVerification {
  status: 'verified' | 'mismatch' | 'unverified' | 'error'
  recordedAt: string | null
}

export default function InspectionPdf() {
  const { id } = useParams<{ id: string }>()
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [lease, setLease] = useState<LeaseCtx | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [verifications, setVerifications] = useState<Record<string, PhotoVerification>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .eq('id', id)
        .single()
      if (cancelled) return
      if (error || !data) {
        setError(error?.message ?? 'Inspection not found')
        setLoading(false)
        return
      }
      const insp = data as Inspection
      setInspection(insp)

      // Load lease context for the header
      const { data: leaseData } = await supabase
        .from('leases')
        .select(`
          start_date, end_date, rent_amount,
          tenant:profiles!leases_tenant_id_fkey ( full_name ),
          unit:units!leases_unit_id_fkey (
            unit_number,
            property:properties!units_property_id_fkey (
              name, address, city, state, zip,
              manager:profiles!properties_manager_id_fkey ( full_name )
            )
          )
        `)
        .eq('id', insp.lease_id)
        .single()
      if (cancelled) return
      if (leaseData) {
        // Supabase returns joined relations as arrays in TS even when the
        // FK is a single ref. Normalize via first() so we get one object.
        const lt = leaseData as unknown as {
          start_date: string; end_date: string; rent_amount: number
          tenant: { full_name: string | null } | { full_name: string | null }[] | null
          unit: {
            unit_number: string
            property: {
              name: string; address: string; city: string; state: string; zip: string
              manager: { full_name: string | null } | { full_name: string | null }[] | null
            } | { unit_number: string; property: unknown }[] | null
          } | { unit_number: string; property: unknown }[] | null
        }
        const first = <T,>(v: T | T[] | null | undefined): T | null =>
          v == null ? null : (Array.isArray(v) ? (v[0] ?? null) : v)
        const tenant   = first(lt.tenant)
        const unit     = first(lt.unit) as { unit_number: string; property: unknown } | null
        const property = first(unit?.property) as
          | { name: string; address: string; city: string; state: string; zip: string; manager: unknown } | null
        const manager  = first(property?.manager) as { full_name: string | null } | null
        setLease({
          unit_number:      unit?.unit_number ?? '',
          property_name:    property?.name ?? '',
          property_address: property?.address ?? '',
          property_city:    property?.city ?? '',
          property_state:   property?.state ?? '',
          property_zip:     property?.zip ?? '',
          start_date:       lt.start_date,
          end_date:         lt.end_date,
          rent_amount:      Number(lt.rent_amount),
          tenant_name:      tenant?.full_name ?? null,
          manager_name:     manager?.full_name ?? null,
        })
      }

      // Photos: download each file ONCE, render it from an object URL, and —
      // when a fingerprint was recorded at upload — re-hash those same bytes
      // against it. That way the image printed on this report is the exact
      // file the "verified" stamp refers to. Legacy photos (no fingerprint on
      // file) are stamped "unverified" — we never claim what we can't prove.
      // Object URLs are not revoked: this is a standalone print page and they
      // live for its lifetime.
      const photoPaths = insp.checklist_data.rooms
        .flatMap((r) => r.items.flatMap((i) => i.photos))
      if (photoPaths.length > 0) {
        const [{ data: signed }, records] = await Promise.all([
          supabase.storage.from('inspection-photos').createSignedUrls(photoPaths, 3600),
          fetchPhotoHashRecords(photoPaths),
        ])
        const urlMap: Record<string, string> = {}
        const verifyMap: Record<string, PhotoVerification> = {}
        await Promise.all(photoPaths.map(async (path, i) => {
          const rec = records[path]
          const signedUrl = signed?.[i]?.signedUrl
          if (!signedUrl) {
            if (rec) verifyMap[path] = { status: 'error', recordedAt: rec.hash_recorded_at }
            return
          }
          try {
            const res = await fetch(signedUrl)
            if (!res.ok) throw new Error(String(res.status))
            const bytes = await res.arrayBuffer()
            urlMap[path] = URL.createObjectURL(new Blob([bytes]))
            verifyMap[path] = rec
              ? { status: await verifyBytesAgainstRecord(bytes, rec), recordedAt: rec.hash_recorded_at }
              : { status: 'unverified', recordedAt: null }
          } catch {
            // Fall back to the signed URL for display; verification stays open.
            urlMap[path] = signedUrl
            verifyMap[path] = rec
              ? { status: 'error', recordedAt: rec.hash_recorded_at }
              : { status: 'unverified', recordedAt: null }
          }
        }))
        if (!cancelled) {
          setPhotoUrls(urlMap)
          setVerifications(verifyMap)
        }
      }

      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-mute"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }
  if (error || !inspection) {
    return (
      <div className="max-w-md mx-auto py-16 px-5 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-red-500" />
        <p className="font-semibold text-ink">Inspection not found</p>
        <p className="text-sm text-mute mt-1">{error ?? 'You may not have access to this inspection.'}</p>
      </div>
    )
  }

  const isSigned = inspection.state === 'both_signed'

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Toolbar — hidden in print */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-mute uppercase tracking-wider font-semibold">{inspection.type === 'move_in' ? 'Move-in' : 'Move-out'} inspection</p>
            <p className="text-sm font-semibold text-ink mt-0.5">
              {lease?.property_name} · Unit {lease?.unit_number}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 bg-ink text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-ink/90"
          >
            <Printer className="w-4 h-4" strokeWidth={2} />
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Sheet */}
      <article className="max-w-3xl mx-auto bg-white print:max-w-none print:mx-0 my-6 print:my-0 p-8 print:p-0 shadow-sm print:shadow-none">
        {/* Header */}
        <header className="border-b border-gray-300 pb-4 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-ink">
                {inspection.type === 'move_in' ? 'Move-In' : 'Move-Out'} Inspection Report
              </h1>
              <p className="text-sm text-mute mt-1">
                Generated {new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-mute font-semibold">{BRAND.name}</p>
              <p className="text-[10px] text-mute mt-0.5">Inspection ID: {inspection.id.slice(0, 8)}</p>
            </div>
          </div>

          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 mt-5 text-sm">
            <Row label="Property"  value={lease ? `${lease.property_name}, ${lease.property_address}, ${lease.property_city} ${lease.property_state} ${lease.property_zip}` : '—'} />
            <Row label="Unit"      value={lease?.unit_number ?? '—'} />
            <Row label="Lease term" value={lease ? `${new Date(lease.start_date).toLocaleDateString()} – ${new Date(lease.end_date).toLocaleDateString()}` : '—'} />
            <Row label="Monthly rent" value={lease ? `$${lease.rent_amount.toLocaleString()}` : '—'} />
            <Row label="Manager"   value={lease?.manager_name ?? '—'} />
            <Row label="Tenant"    value={lease?.tenant_name ?? '—'} />
          </dl>
        </header>

        {/* Rooms */}
        {inspection.checklist_data.rooms.map((room) => {
          const recordedItems = room.items.filter((i) => i.condition || i.notes || i.photos.length > 0)
          if (recordedItems.length === 0) {
            return (
              <section key={room.name} className="mb-5">
                <h2 className="text-base font-bold text-ink border-b border-gray-200 pb-1 mb-2">{room.name}</h2>
                <p className="text-xs text-mute italic">No items recorded.</p>
              </section>
            )
          }
          return (
            <section key={room.name} className="mb-5 break-inside-avoid">
              <h2 className="text-base font-bold text-ink border-b border-gray-200 pb-1 mb-2">{room.name}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-mute">
                    <th className="py-1.5 w-1/3">Item</th>
                    <th className="py-1.5 w-24">Condition</th>
                    <th className="py-1.5">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {room.items.map((item) => (
                    <tr key={item.key} className="border-t border-gray-100 align-top">
                      <td className="py-2 pr-2 font-medium text-ink">{item.name}</td>
                      <td className="py-2 pr-2">
                        {item.condition ? (
                          <span className={`text-xs font-semibold ${CONDITION_CLS[item.condition]}`}>
                            {CONDITION_LABEL[item.condition]}
                          </span>
                        ) : (
                          <span className="text-xs text-mute">—</span>
                        )}
                      </td>
                      <td className="py-2 text-mute text-sm leading-relaxed">
                        {item.notes || <span className="text-gray-300">—</span>}
                        {item.photos.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5 items-start">
                            {item.photos.map((p, i) => (
                              <figure key={i} className="w-20 m-0">
                                {photoUrls[p]
                                  ? <img src={photoUrls[p]} alt="" className="w-20 h-20 object-cover rounded border border-gray-200" />
                                  : <div className="w-20 h-20 bg-gray-100 rounded" />}
                                <PhotoStamp verification={verifications[p]} />
                              </figure>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )
        })}

        {/* Meter readings */}
        {(inspection.checklist_data.meter_readings.electric ||
          inspection.checklist_data.meter_readings.gas ||
          inspection.checklist_data.meter_readings.water) && (
          <section className="mb-5 break-inside-avoid">
            <h2 className="text-base font-bold text-ink border-b border-gray-200 pb-1 mb-2">Meter Readings</h2>
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <ReadingItem label="Electric" value={inspection.checklist_data.meter_readings.electric} />
              <ReadingItem label="Gas"      value={inspection.checklist_data.meter_readings.gas} />
              <ReadingItem label="Water"    value={inspection.checklist_data.meter_readings.water} />
            </dl>
          </section>
        )}

        {/* Keys handed over */}
        {inspection.checklist_data.keys_handover.length > 0 && (
          <section className="mb-5 break-inside-avoid">
            <h2 className="text-base font-bold text-ink border-b border-gray-200 pb-1 mb-2">Keys + Access</h2>
            <ul className="list-disc pl-5 text-sm space-y-0.5">
              {inspection.checklist_data.keys_handover.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Notes */}
        {(inspection.manager_notes || inspection.tenant_notes) && (
          <section className="mb-5 break-inside-avoid">
            <h2 className="text-base font-bold text-ink border-b border-gray-200 pb-1 mb-2">Notes</h2>
            <div className="space-y-3 text-sm">
              {inspection.manager_notes && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-mute font-semibold mb-0.5">Manager</p>
                  <p className="whitespace-pre-wrap text-ink">{inspection.manager_notes}</p>
                </div>
              )}
              {inspection.tenant_notes && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-mute font-semibold mb-0.5">Tenant</p>
                  <p className="whitespace-pre-wrap text-ink">{inspection.tenant_notes}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Signatures */}
        <section className="mt-8 pt-5 border-t-2 border-gray-300 break-inside-avoid">
          <h2 className="text-base font-bold text-ink mb-3">Signatures</h2>
          <div className="grid sm:grid-cols-2 gap-6 text-sm">
            <SignatureBlock
              label="Manager / Landlord"
              name={inspection.manager_signature_name ?? lease?.manager_name ?? '—'}
              signedAt={inspection.manager_signed_at}
            />
            <SignatureBlock
              label="Tenant"
              name={inspection.tenant_signature_name ?? lease?.tenant_name ?? '—'}
              signedAt={inspection.tenant_signed_at}
            />
          </div>
          {!isSigned && (
            <p className="text-xs text-amber-700 mt-4 inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
              This document is <strong>not yet fully signed</strong>. It becomes a binding record only after both parties sign.
            </p>
          )}
          {isSigned && (
            <p className="text-xs text-emerald-700 mt-4 inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2} />
              Signed by both parties. Stored as part of the lease record.
            </p>
          )}
        </section>

        {/* Photo verification footnote — only when the report contains photos */}
        {Object.keys(verifications).length > 0 && (
          <section className="mt-6 pt-3 border-t border-gray-200 text-[10px] text-mute leading-relaxed break-inside-avoid">
            <p className="font-semibold text-ink text-[10px] uppercase tracking-wider mb-1">About photo verification</p>
            <p>
              When a photo is added to an inspection, {BRAND.name} records a digital fingerprint
              (a SHA-256 hash) of the exact file, with the date and time stamped by our servers —
              not by either party&rsquo;s device. That record cannot be changed or backdated by anyone,
              including the landlord or tenant. When this report was generated, each photo was
              downloaded and re-checked against its recorded fingerprint. &ldquo;SHA-256 verified&rdquo;
              means the photo shown is identical, byte for byte, to the file captured on the recorded
              date — it has not been edited, retouched, or replaced since. Photos marked
              &ldquo;unverified&rdquo; were uploaded before fingerprinting was available; no claim is
              made about them either way.
            </p>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-8 pt-4 border-t border-gray-200 text-[10px] text-mute leading-relaxed">
          This inspection report was generated by {BRAND.name}. Both parties have a copy
          via their dashboard. To dispute or correct an entry after signing, contact
          the other party directly — amendments require both signatures.
        </footer>
      </article>
    </div>
  )
}

function PhotoStamp({ verification }: { verification?: PhotoVerification }) {
  if (!verification) return null
  const { status, recordedAt } = verification
  if (status === 'verified' && recordedAt) {
    return (
      <figcaption className="mt-0.5 text-[8px] leading-tight text-emerald-700">
        SHA-256 verified — captured {capturedDateTime(recordedAt)}, unaltered
      </figcaption>
    )
  }
  if (status === 'mismatch') {
    return (
      <figcaption className="mt-0.5 text-[8px] leading-tight text-red-700 font-semibold">
        Does not match the original upload — file may have been altered
      </figcaption>
    )
  }
  if (status === 'error') {
    return (
      <figcaption className="mt-0.5 text-[8px] leading-tight text-mute">
        Verification unavailable — the file could not be re-checked
      </figcaption>
    )
  }
  return (
    <figcaption className="mt-0.5 text-[8px] leading-tight text-mute">
      Unverified — uploaded before photo verification was available
    </figcaption>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-mute font-semibold">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  )
}

function ReadingItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-mute font-semibold">{label}</p>
      <p className="font-mono text-ink mt-0.5">{value || '—'}</p>
    </div>
  )
}

function SignatureBlock({ label, name, signedAt }: { label: string; name: string; signedAt: string | null }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-mute font-semibold">{label}</p>
      <div className="mt-1 border-b border-gray-400 pb-1 min-h-[2.25rem]">
        {signedAt && (
          <span className="font-signature text-2xl text-ink" style={{ fontFamily: '"Dancing Script", cursive' }}>{name}</span>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-mute mt-1">
        <span>{name}</span>
        <span>{signedAt ? new Date(signedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not signed'}</span>
      </div>
    </div>
  )
}
