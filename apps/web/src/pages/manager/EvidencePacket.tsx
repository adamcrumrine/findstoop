// Evidence packet — one printable document per lease containing every
// tamper-evident photo fingerprint the platform holds: inspection photos and
// maintenance-request photos, each with its SHA-256, the server-stamped
// recording time, and plain-language verification instructions a judge (or
// opposing party) can follow. The packet doesn't re-verify anything itself —
// it's the LOG; verification is the documented procedure.
//
// Standalone print page (same pattern as /manager/invoice/:id). RLS scopes
// every query: the lease's manager, its tenant, or an admin.

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { BRAND } from '../../lib/brand'
import { capturedDateTime } from '../../lib/photoIntegrity'

interface HashRow {
  storage_path: string
  content_hash: string
  hash_recorded_at: string
  /** Context line: inspection type + date, or maintenance request title. */
  context: string
}

interface PacketData {
  propertyLabel: string
  unitLabel: string
  tenantName: string | null
  leaseStart: string | null
  leaseEnd: string | null
  inspectionRows: HashRow[]
  maintenanceRows: HashRow[]
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—'
}

async function loadPacket(leaseId: string): Promise<PacketData> {
  const { data: lease, error } = await supabase
    .from('leases')
    .select(`
      id, start_date, end_date, unit_id, tenant_id,
      tenant:profiles!leases_tenant_id_fkey(full_name),
      unit:units(unit_number, properties(name, address, city, state, zip))
    `)
    .eq('id', leaseId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!lease) throw new Error('Lease not found (or you don’t have access to it).')
  // deno-lint irrelevant here; supabase-js types embeds loosely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const l = lease as any
  const tenant = Array.isArray(l.tenant) ? l.tenant[0] : l.tenant
  const unit = Array.isArray(l.unit) ? l.unit[0] : l.unit
  const property = unit && (Array.isArray(unit.properties) ? unit.properties[0] : unit.properties)

  // Inspection fingerprints, with the inspection's type/date for context.
  const { data: inspections } = await supabase
    .from('inspections')
    .select('id, type, created_at')
    .eq('lease_id', leaseId)
  const inspectionById = new Map((inspections ?? []).map((i) => [i.id, i]))
  const { data: iHashes } = await supabase
    .from('inspection_photo_hashes')
    .select('storage_path, content_hash, hash_recorded_at, inspection_id')
    .eq('lease_id', leaseId)
    .order('hash_recorded_at', { ascending: true })
  const inspectionRows: HashRow[] = (iHashes ?? []).map((h) => {
    const insp = inspectionById.get((h as { inspection_id: string }).inspection_id)
    const label = insp ? `${String(insp.type ?? 'inspection').replace(/_/g, ' ')} inspection · ${fmtDate(insp.created_at)}` : 'inspection'
    return { storage_path: h.storage_path, content_hash: h.content_hash, hash_recorded_at: h.hash_recorded_at, context: label }
  })

  // Maintenance fingerprints for this lease's unit + tenant.
  const { data: requests } = await supabase
    .from('maintenance_requests')
    .select('id, title, created_at')
    .eq('unit_id', l.unit_id)
    .eq('tenant_id', l.tenant_id)
  const requestById = new Map((requests ?? []).map((r) => [r.id, r]))
  let maintenanceRows: HashRow[] = []
  const requestIds = (requests ?? []).map((r) => r.id)
  if (requestIds.length > 0) {
    const { data: mHashes } = await supabase
      .from('maintenance_photo_hashes')
      .select('storage_path, content_hash, hash_recorded_at, request_id')
      .in('request_id', requestIds)
      .order('hash_recorded_at', { ascending: true })
    maintenanceRows = (mHashes ?? []).map((h) => {
      const req = requestById.get((h as { request_id: string }).request_id)
      return {
        storage_path: h.storage_path,
        content_hash: h.content_hash,
        hash_recorded_at: h.hash_recorded_at,
        context: req ? `“${req.title}” · filed ${fmtDate(req.created_at)}` : 'maintenance request',
      }
    })
  }

  return {
    propertyLabel: property
      ? `${property.name ?? property.address ?? 'Property'}${property.address ? ` — ${[property.address, property.city, property.state, property.zip].filter(Boolean).join(', ')}` : ''}`
      : 'Property',
    unitLabel: unit?.unit_number ? `Unit ${unit.unit_number}` : '',
    tenantName: tenant?.full_name ?? null,
    leaseStart: l.start_date,
    leaseEnd: l.end_date,
    inspectionRows,
    maintenanceRows,
  }
}

function HashTable({ rows }: { rows: HashRow[] }) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b border-gray-300 text-left">
          <th className="py-1.5 pr-3 font-semibold">Context</th>
          <th className="py-1.5 pr-3 font-semibold">File</th>
          <th className="py-1.5 pr-3 font-semibold">Recorded (server-stamped)</th>
          <th className="py-1.5 font-semibold">SHA-256 fingerprint</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.storage_path} className="border-b border-gray-100 align-top break-inside-avoid">
            <td className="py-1.5 pr-3 capitalize">{r.context}</td>
            <td className="py-1.5 pr-3 font-mono text-[10px] break-all">{r.storage_path}</td>
            <td className="py-1.5 pr-3 whitespace-nowrap">{capturedDateTime(r.hash_recorded_at)}</td>
            <td className="py-1.5 font-mono text-[10px] break-all">{r.content_hash}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function EvidencePacket() {
  const { leaseId } = useParams<{ leaseId: string }>()
  const [data, setData] = useState<PacketData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leaseId) return
    let cancelled = false
    loadPacket(leaseId)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not build the packet') })
    return () => { cancelled = true }
  }, [leaseId])

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <p className="text-mute">{error}</p>
        <Link to="/manager/leases" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 mt-4">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to Leases
        </Link>
      </div>
    )
  }
  if (!data) {
    return <div className="flex items-center justify-center min-h-screen text-mute"><Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} /></div>
  }

  const total = data.inspectionRows.length + data.maintenanceRows.length

  return (
    <div className="bg-gray-100 min-h-screen">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/manager/leases" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Back to Leases
          </Link>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg">
            <Printer className="w-4 h-4" strokeWidth={1.75} /> Print or save as PDF
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto bg-white shadow-sm my-6 print:my-0 print:shadow-none">
        <div className="px-8 py-8 print:px-8 print:py-6 text-ink" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-brand-600" strokeWidth={1.75} />
                Photo evidence packet
              </h1>
              <p className="text-sm text-mute mt-1">{data.propertyLabel}{data.unitLabel ? ` · ${data.unitLabel}` : ''}</p>
              <p className="text-sm text-mute">
                {data.tenantName ? `Tenant: ${data.tenantName} · ` : ''}Lease {fmtDate(data.leaseStart)} – {fmtDate(data.leaseEnd)}
              </p>
              <p className="text-sm text-mute">Generated {new Date().toLocaleDateString('en-US', { dateStyle: 'long' })} · {total} fingerprinted photo{total === 1 ? '' : 's'}</p>
            </div>
            <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-9" />
          </div>

          {/* How to read this */}
          <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-6 text-sm leading-relaxed break-inside-avoid">
            <h2 className="font-semibold mb-1.5">What this packet proves, and how to check it</h2>
            <p>
              Each photo below was fingerprinted the moment it was uploaded: the SHA-256 value is a
              mathematical digest of the exact file bytes, and the recording time was stamped by the
              server — the uploader cannot choose or change it, and records cannot be edited or
              deleted once written.
            </p>
            <ol className="list-decimal pl-5 mt-2 space-y-1">
              <li>Obtain the photo file (from the {BRAND.name} app, or as produced in discovery).</li>
              <li>Compute its SHA-256 with any standard tool — e.g. <span className="font-mono text-xs">certutil -hashfile photo.jpg SHA256</span> (Windows) or <span className="font-mono text-xs">shasum -a 256 photo.jpg</span> (Mac).</li>
              <li>Compare against the fingerprint in this log. A match proves the file is byte-for-byte identical to what was uploaded on the recorded date. Any edit — even one pixel — produces a different fingerprint.</li>
            </ol>
            <p className="mt-2 text-xs text-mute">
              Photos taken before fingerprinting was introduced have no entry here and no integrity claim is made for them.
              This packet is documentation, not legal advice.
            </p>
          </section>

          {/* Inspection photos */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-mute mb-2">Inspection photos ({data.inspectionRows.length})</h2>
            {data.inspectionRows.length > 0
              ? <HashTable rows={data.inspectionRows} />
              : <p className="text-sm text-mute">No fingerprinted inspection photos on this lease.</p>}
          </section>

          {/* Maintenance photos */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-mute mb-2">Maintenance-request photos ({data.maintenanceRows.length})</h2>
            {data.maintenanceRows.length > 0
              ? <HashTable rows={data.maintenanceRows} />
              : <p className="text-sm text-mute">No fingerprinted maintenance photos on this lease.</p>}
          </section>

          <div className="pt-4 border-t border-gray-200 text-xs text-mute flex items-center justify-between">
            <span>Integrity log — append-only, server-timestamped</span>
            <span>Generated by {BRAND.name} · {BRAND.domain}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
