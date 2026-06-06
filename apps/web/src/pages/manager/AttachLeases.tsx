// Post-import flow: attach signed-lease PDFs to leases that are already
// in the database. Manager landed on /manager/leases/attach because they
// either skipped PDFs during the original migration or new ones turned up
// later. We:
//
//   1. Fetch the manager's pending + upcoming leases that don't already
//      have a 'lease' document on file.
//   2. Auto-match dropped PDFs by filename + first-page text (same scorer
//      as the wizard).
//   3. On submit: upload each PDF, then call attach-existing-lease-pdf
//      to insert documents row + flip lease status atomically.
//
// Reuses scoreLeasePdfMatch + extractPdfFirstPageText from the shared
// helper so the matching behaves identically to the wizard.

import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Upload, CheckCircle2, AlertTriangle, Loader2,
  FileText, Plus, X as XIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  extractPdfFirstPageText, extractLeaseStartDate, autoMatchPdfs,
  type LeasePdfMatch,
} from '../../lib/leasePdfMatch'

interface UnitOption {
  id: string
  unit_number: string
  rent_amount: number
  property_address: string
  property_id: string
}

type Step = 'pick' | 'review' | 'done'

interface EligibleLease {
  id: string
  status: 'pending' | 'upcoming' | 'active'
  start_date: string
  end_date: string | null
  property_address: string
  unit_number: string
  tenants: { last_name: string; first_name: string }[]
}

interface AttachResult {
  lease_id: string
  filename: string
  previous_status: string
  new_status: string
  ok: boolean
  message?: string
}

export default function AttachLeases() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('pick')
  const [loading, setLoading] = useState(true)
  const [eligibleLeases, setEligibleLeases] = useState<EligibleLease[]>([])
  const [allUnits, setAllUnits] = useState<UnitOption[]>([])
  const [pdfs, setPdfs] = useState<File[]>([])
  const [pdfHints, setPdfHints] = useState<string[]>([])
  const [matches, setMatches] = useState<Record<string, LeasePdfMatch | undefined>>({})
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<AttachResult[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  // "Create new lease from a PDF" form — open/close state. The form
  // itself manages its inputs locally; on success we reload the page so
  // the new lease shows up in the list and the manager has a clean slate
  // to add another if they need to.
  const [createOpen, setCreateOpen] = useState(false)

  // ── Fetch eligible leases on mount ───────────────────────────────────────
  useEffect(() => {
    if (!profile) return
    void (async () => {
      setLoading(true)
      try {
        // Pending + upcoming leases on properties this manager owns.
        // Embeds unit + property + tenants via lease_tenants.
        const { data, error } = await supabase
          .from('leases')
          .select(`
            id, status, start_date, end_date,
            unit:units!inner(
              unit_number,
              property:properties!inner(manager_id, address)
            ),
            lease_tenants(
              tenant:profiles(full_name)
            ),
            documents(id, type)
          `)
          .in('status', ['pending', 'upcoming', 'active'])
        if (error) throw error
        type Row = {
          id: string
          status: 'pending' | 'upcoming' | 'active'
          start_date: string
          end_date: string | null
          unit: { unit_number: string | null; property: { manager_id: string; address: string } }
          lease_tenants: Array<{ tenant: { full_name: string | null } | null }>
          documents: Array<{ id: string; type: string }>
        }
        const rows = (data ?? []) as unknown as Row[]
        const mine = rows.filter((r) => r.unit?.property?.manager_id === profile.id)
        // Drop leases that already have a signed-lease document.
        const eligible = mine
          .filter((r) => !r.documents.some((d) => d.type === 'lease'))
          .map<EligibleLease>((r) => ({
            id: r.id,
            status: r.status,
            start_date: r.start_date,
            end_date: r.end_date,
            property_address: r.unit.property.address,
            unit_number: r.unit.unit_number ?? '',
            tenants: r.lease_tenants
              .map((lt) => {
                const fn = (lt.tenant?.full_name ?? '').trim()
                const parts = fn.split(/\s+/)
                return {
                  first_name: parts.slice(0, -1).join(' ') || parts[0] || '',
                  last_name: parts.length > 1 ? parts[parts.length - 1] : '',
                }
              })
              .filter((t) => t.last_name),
          }))
        setEligibleLeases(eligible)

        // Also fetch all of the manager's units so the "create new lease
        // from PDF" form can offer a unit dropdown without re-querying.
        const { data: unitData } = await supabase
          .from('units')
          .select('id, unit_number, rent_amount, property_id, property:properties!inner(id, manager_id, address)')
        type UnitRow = {
          id: string; unit_number: string | null; rent_amount: number; property_id: string;
          property: { manager_id: string; address: string }
        }
        const units = ((unitData ?? []) as unknown as UnitRow[])
          .filter((u) => u.property?.manager_id === profile.id)
          .map<UnitOption>((u) => ({
            id: u.id,
            unit_number: u.unit_number ?? '',
            rent_amount: Number(u.rent_amount ?? 0),
            property_address: u.property.address,
            property_id: u.property_id,
          }))
        setAllUnits(units)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load leases')
      } finally {
        setLoading(false)
      }
    })()
  }, [profile])

  // ── Auto-match whenever leases or pdf hints settle ───────────────────────
  useEffect(() => {
    if (eligibleLeases.length === 0 || pdfHints.length === 0) return
    setMatches((prev) =>
      autoMatchPdfs<string>(
        eligibleLeases.map((l) => ({
          key: l.id,
          property_address: l.property_address,
          unit_number: l.unit_number,
          tenants: l.tenants,
        })),
        pdfHints,
        prev,
      ),
    )
  }, [eligibleLeases, pdfHints])

  // ── File handling ────────────────────────────────────────────────────────
  const addFiles = (incoming: File[]) => {
    const pdfsOnly = incoming.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
    const rejected = incoming.length - pdfsOnly.length
    if (rejected > 0) toast.error(`Skipped ${rejected} non-PDF file${rejected === 1 ? '' : 's'}`)
    if (pdfsOnly.length === 0) return
    const startIdx = pdfs.length
    setPdfs((prev) => [...prev, ...pdfsOnly])
    setPdfHints((prev) => [...prev, ...pdfsOnly.map((f) => f.name.toLowerCase())])
    pdfsOnly.forEach((f, i) => {
      void extractPdfFirstPageText(f).then((text) => {
        setPdfHints((prev) => {
          const next = [...prev]
          next[startIdx + i] = `${f.name.toLowerCase()} ${text.toLowerCase()}`
          return next
        })
      })
    })
  }

  const removePdf = (i: number) => {
    setPdfs((prev) => prev.filter((_, idx) => idx !== i))
    setPdfHints((prev) => prev.filter((_, idx) => idx !== i))
    setMatches((prev) => {
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        const m = next[k]
        if (!m) continue
        if (m.fileIndex === i) delete next[k]
        else if (m.fileIndex > i) next[k] = { ...m, fileIndex: m.fileIndex - 1 }
      }
      return next
    })
  }

  const assign = (leaseId: string, fileIdx: number | null) => {
    setMatches((prev) => {
      const next = { ...prev }
      // Clear any other lease using this file.
      for (const k of Object.keys(next)) {
        if (next[k]?.fileIndex === fileIdx) delete next[k]
      }
      if (fileIdx == null) delete next[leaseId]
      else next[leaseId] = { fileIndex: fileIdx, score: 1, manuallyAssigned: true }
      return next
    })
  }

  // ── Drag handlers ────────────────────────────────────────────────────────
  const onDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault(); e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    if (!isDragOver) setIsDragOver(true)
  }
  const onDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
  }
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
    const dropped = Array.from(e.dataTransfer?.files ?? [])
    if (dropped.length > 0) addFiles(dropped)
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const assignedFileIdxs = useMemo(() => {
    const s = new Set<number>()
    for (const m of Object.values(matches)) { if (m) s.add(m.fileIndex) }
    return s
  }, [matches])
  const unassignedPdfs = pdfs.map((f, i) => ({ file: f, idx: i })).filter((p) => !assignedFileIdxs.has(p.idx))
  const matchedCount = Object.keys(matches).length

  // ── Submit ───────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!profile) return
    if (matchedCount === 0) {
      toast.error('Match at least one PDF to a lease first.')
      return
    }
    setSubmitting(true)
    const importStamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const out: AttachResult[] = []
    for (const [leaseId, m] of Object.entries(matches)) {
      if (!m) continue
      const file = pdfs[m.fileIndex]
      if (!file) continue
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
      const path = `${profile.id}/attach/${importStamp}/${m.fileIndex}-${safeName}`
      const { error: upErr } = await supabase.storage.from('lease-documents').upload(path, file, {
        contentType: 'application/pdf',
        upsert: false,
      })
      if (upErr) {
        out.push({ lease_id: leaseId, filename: file.name, previous_status: '', new_status: '', ok: false, message: upErr.message })
        continue
      }
      const { data, error } = await supabase.functions.invoke('attach-existing-lease-pdf', {
        body: { lease_id: leaseId, storage_path: path, filename: file.name },
      })
      if (error || !data?.ok) {
        out.push({ lease_id: leaseId, filename: file.name, previous_status: '', new_status: '', ok: false, message: error?.message ?? data?.message ?? 'failed' })
        continue
      }
      out.push({
        lease_id: leaseId,
        filename: file.name,
        previous_status: data.previous_status,
        new_status: data.new_status,
        ok: true,
      })
    }
    setResults(out)
    setSubmitting(false)
    setStep('done')
  }

  if (!profile) return <div className="p-8 text-mute">Loading…</div>

  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Attach signed leases</h1>
        <p className="text-sm text-mute mt-1">
          Drop in any signed-lease PDFs and we'll match them to your existing
          pending or upcoming leases. Matched leases activate automatically.
        </p>
      </header>

      {step === 'pick' && !loading && (
        <CreateLeaseFromPdfSection
          units={allUnits}
          open={createOpen}
          onToggle={() => setCreateOpen((o) => !o)}
          onCreated={() => {
            setCreateOpen(false)
            // Re-fetch eligible leases so any newly-created pending lease
            // shows up. Cheap and avoids stale-state edge cases.
            location.reload()
          }}
        />
      )}

      {step === 'pick' && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          {loading ? (
            <div className="text-center py-12 text-mute">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading your leases…
            </div>
          ) : eligibleLeases.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600 mb-2" />
              <p className="text-sm font-semibold text-ink">All your leases already have signed PDFs.</p>
              <p className="text-xs text-mute mt-1">Nothing to do here. Nice.</p>
              <Link to="/manager/leases" className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-800 font-medium mt-4">
                Back to Leases
                <ArrowRight className="w-4 h-4" strokeWidth={2} />
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-ink mb-4">
                <strong>{eligibleLeases.length}</strong> lease{eligibleLeases.length === 1 ? '' : 's'} still need
                {eligibleLeases.length === 1 ? 's' : ''} a signed PDF on file.
              </p>

              {/* Drop zone */}
              <label
                onDragOver={onDragOver}
                onDragEnter={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`block w-full rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors mb-5 ${
                  isDragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-brand-400 bg-white'
                }`}
              >
                <input
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = '' }}
                  className="sr-only"
                />
                <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragOver ? 'text-brand-600' : 'text-mute'}`} strokeWidth={1.75} />
                <p className="text-sm font-medium text-ink">
                  {isDragOver
                    ? 'Drop to load'
                    : pdfs.length === 0
                      ? 'Drag your signed lease PDFs here'
                      : 'Add more PDFs (drag or click)'}
                </p>
                <p className="text-xs text-mute mt-1">
                  We'll match each PDF to a lease using the filename and contents
                </p>
              </label>

              {/* PDF list */}
              {pdfs.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs text-mute font-semibold uppercase tracking-wider mb-2">
                    {pdfs.length} PDF{pdfs.length === 1 ? '' : 's'} loaded — {matchedCount} matched, {unassignedPdfs.length} not yet matched
                  </p>
                  <ul className="space-y-1.5">
                    {pdfs.map((f, i) => {
                      const isAssigned = assignedFileIdxs.has(i)
                      return (
                        <li
                          key={`${f.name}-${i}`}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                            isAssigned ? 'border-violet-200 bg-violet-50/40' : 'border-amber-200 bg-amber-50/40'
                          }`}
                        >
                          <FileText className={`w-4 h-4 shrink-0 ${isAssigned ? 'text-violet-700' : 'text-amber-700'}`} strokeWidth={2} />
                          <span className="flex-1 min-w-0 truncate font-medium text-ink">{f.name}</span>
                          <span className="text-[10px] text-mute">{(f.size / 1024).toFixed(0)} KB</span>
                          <button
                            type="button"
                            onClick={() => removePdf(i)}
                            className="p-1 rounded hover:bg-white text-mute hover:text-ink"
                            aria-label={`Remove ${f.name}`}
                          >
                            <XIcon className="w-3.5 h-3.5" strokeWidth={2} />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* Lease list */}
              <p className="text-xs text-mute font-semibold uppercase tracking-wider mb-2">
                Leases needing a signed PDF
              </p>
              <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1 mb-5">
                {eligibleLeases.map((lease) => {
                  const match = matches[lease.id]
                  const file = match ? pdfs[match.fileIndex] : null
                  return (
                    <div key={lease.id} className="bg-gray-50/70 border border-gray-200 rounded-xl p-3">
                      <div className="flex items-baseline justify-between gap-3 mb-0.5">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <p className="text-sm font-semibold text-ink truncate">
                            {lease.property_address}{lease.unit_number ? ` · Unit ${lease.unit_number}` : ''}
                          </p>
                          <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                            lease.status === 'upcoming' ? 'text-blue-700 bg-blue-100 border-blue-200'
                              : lease.status === 'active' ? 'text-emerald-700 bg-emerald-100 border-emerald-200'
                              : 'text-mute bg-gray-100 border-gray-200'
                          }`}>
                            {lease.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-mute uppercase tracking-wider font-semibold shrink-0">
                          {lease.tenants.map((t) => t.last_name).filter(Boolean).join(', ') || '—'}
                        </p>
                      </div>
                      <p className="text-[11px] text-mute mb-1.5">
                        {lease.start_date} → {lease.end_date ?? '?'}
                      </p>
                      {file ? (() => {
                        // Tenant-mismatch warning: if the PDF text doesn't
                        // mention any of the lease's known tenant last
                        // names, the matcher may have paired the wrong
                        // PDF with the wrong lease. Common when addresses
                        // are similar (same building) but tenants differ.
                        const hay = (pdfHints[match!.fileIndex] ?? '').toLowerCase()
                        const knownLastNames = lease.tenants.map((t) => t.last_name.toLowerCase()).filter((s) => s.length >= 3)
                        const hasTenantNameInPdf = knownLastNames.length === 0
                          || knownLastNames.some((ln) => hay.includes(ln))
                        return (
                        <>
                        <div className="flex items-center gap-2 bg-white border border-violet-200 rounded-md px-2.5 py-1.5">
                          <FileText className="w-4 h-4 text-violet-700 shrink-0" strokeWidth={2} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-ink truncate">{file.name}</p>
                            <p className="text-[10px] text-mute">
                              {match?.manuallyAssigned
                                ? 'You picked this'
                                : `Auto-matched (${Math.round((match?.score ?? 0) * 100)}%)`}
                            </p>
                          </div>
                          <select
                            value={match?.fileIndex ?? ''}
                            onChange={(e) => assign(lease.id, e.target.value === '' ? null : Number(e.target.value))}
                            className="text-[11px] border border-gray-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                          >
                            {pdfs.map((p, i) => (<option key={i} value={i}>{p.name}</option>))}
                          </select>
                          <button
                            type="button"
                            onClick={() => assign(lease.id, null)}
                            className="p-1 rounded hover:bg-gray-100 text-mute hover:text-ink"
                            aria-label="Remove PDF assignment"
                          >
                            <XIcon className="w-3.5 h-3.5" strokeWidth={2} />
                          </button>
                        </div>
                        {!hasTenantNameInPdf && !match?.manuallyAssigned && knownLastNames.length > 0 && (
                          <div className="mt-1.5 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 text-[11px] text-amber-900">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" strokeWidth={2} />
                            <span>
                              This PDF doesn't appear to mention <strong>{knownLastNames.join(', ')}</strong> — double-check it's the right lease. Click the dropdown to swap or remove.
                            </span>
                          </div>
                        )}
                        </>
                        )
                      })() : (
                        <div className="flex items-center gap-2 text-xs text-mute">
                          <span className="italic">No PDF matched yet</span>
                          {unassignedPdfs.length > 0 && (
                            <select
                              defaultValue=""
                              onChange={(e) => { if (e.target.value !== '') assign(lease.id, Number(e.target.value)) }}
                              className="text-[11px] border border-gray-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                            >
                              <option value="">Pick a PDF…</option>
                              {unassignedPdfs.map((p) => (<option key={p.idx} value={p.idx}>{p.file.name}</option>))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {unassignedPdfs.length > 0 && (
                <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 mb-5 text-xs text-amber-900">
                  <p className="font-semibold inline-flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
                    {unassignedPdfs.length} PDF{unassignedPdfs.length === 1 ? '' : 's'} not matched
                  </p>
                  <p className="mt-1 text-[11px]">Use the "Pick a PDF…" dropdowns to assign them. Unassigned PDFs are skipped on submit.</p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <Link to="/manager/leases" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
                  <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                  Cancel
                </Link>
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting || matchedCount === 0}
                  className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" strokeWidth={2} />}
                  {submitting ? 'Attaching…' : `Attach ${matchedCount} PDF${matchedCount === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {step === 'done' && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-3" strokeWidth={1.5} />
          <h2 className="text-xl font-bold text-ink">Done.</h2>
          <p className="text-sm text-mute mt-2">
            {results.filter((r) => r.ok).length} of {results.length} PDF{results.length === 1 ? '' : 's'} attached.
          </p>

          <ul className="mt-5 space-y-1.5 text-left text-xs max-h-72 overflow-y-auto">
            {results.map((r, i) => (
              <li
                key={i}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                  r.ok ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40'
                }`}
              >
                {r.ok
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={2} />
                  : <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" strokeWidth={2} />}
                <span className="flex-1 truncate font-medium text-ink">{r.filename}</span>
                {r.ok ? (
                  <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">
                    {r.previous_status} → {r.new_status}
                  </span>
                ) : (
                  <span className="text-[10px] text-red-700">{r.message ?? 'failed'}</span>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/manager/leases')}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium px-5 py-2.5 rounded-lg"
            >
              View leases
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => {
                // Reset and let them attach more
                setStep('pick'); setPdfs([]); setPdfHints([]); setMatches({}); setResults([])
              }}
              className="inline-flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-ink font-medium px-5 py-2.5 rounded-lg"
            >
              Attach more
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

// ── CreateLeaseFromPdfSection ─────────────────────────────────────────────
// Collapsible card at the top of AttachLeases. Lets the manager add a
// brand-new lease for any unit they own — typically the missing CURRENT
// tenant on a unit that already has an UPCOMING lease from the import.
//
// Supports multiple tenants. Each tenant row collects email + first/last
// name + phone; the server-side create-lease-from-pdf function looks up
// or invites each tenant before creating the lease. So adding 4 roommates
// + uploading the signed PDF + activating the lease is one submit.
interface CreatedLeaseResult {
  lease_id: string; status: string; tenant_count: number;
  invited_count: number; filename: string
}

function CreateLeaseFromPdfSection({ units, open, onToggle, onCreated }: {
  units: UnitOption[]
  open: boolean
  onToggle: () => void
  onCreated: (r: CreatedLeaseResult) => void
}) {
  const { profile } = useAuth()
  const todayIso = new Date().toISOString().slice(0, 10)
  const [pdf, setPdf] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  // Storage path the PDF was uploaded to during auto-extract. Submit reuses
  // this so we don't double-upload (saves a round trip + a duplicate object).
  const [extractedPath, setExtractedPath] = useState<string | null>(null)
  const [unitId, setUnitId] = useState('')
  const [leaseStart, setLeaseStart] = useState(todayIso)
  const [leaseEnd, setLeaseEnd] = useState(() => {
    const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [rentAmount, setRentAmount] = useState('')
  const [securityDeposit, setSecurityDeposit] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [tenants, setTenants] = useState<Array<{ email: string; first: string; last: string; phone: string }>>([
    { email: '', first: '', last: '', phone: '' },
  ])
  // When the AI extracts fields from a PDF, we surface a banner so the
  // manager EXPLICITLY confirms before saving — a silent pre-fill is too
  // easy to misclick past. The banner stays until the user changes any
  // tenant field (which we treat as "they're reviewing/editing now").
  const [extractedAt, setExtractedAt] = useState<Date | null>(null)
  const [extractedConfirmed, setExtractedConfirmed] = useState(false)

  const setTenant = (i: number, patch: Partial<{ email: string; first: string; last: string; phone: string }>) => {
    setTenants((arr) => arr.map((t, idx) => idx === i ? { ...t, ...patch } : t))
  }
  const addTenantRow = () => setTenants((arr) => [...arr, { email: '', first: '', last: '', phone: '' }])
  const removeTenantRow = (i: number) => setTenants((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr)

  const onPickFile = async (file: File | null) => {
    setPdf(file)
    setExtractedPath(null)
    if (!file) return
    setExtracting(true)
    try {
      // Step 1: light client-side date extraction so the user sees a default
      // start date immediately if the AI extract is slow / fails.
      const text = await extractPdfFirstPageText(file)
      const fallbackStart = extractLeaseStartDate(text)
      if (fallbackStart) {
        setLeaseStart(fallbackStart)
        const d = new Date(fallbackStart + 'T00:00:00Z')
        d.setUTCFullYear(d.getUTCFullYear() + 1)
        setLeaseEnd(d.toISOString().slice(0, 10))
      }

      // Step 2: full Claude-powered extraction. Upload to a temporary path
      // so the server-side function can read it, then call extract-lease-fields.
      // The temp upload becomes the real lease document on submit, so no
      // wasted upload — we keep the same `path` value and reuse it.
      if (!profile) return
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
      const path = `${profile.id}/extract/${stamp}-${safeName}`
      const { error: upErr } = await supabase.storage.from('lease-documents').upload(path, file, {
        contentType: 'application/pdf', upsert: false,
      })
      if (upErr) {
        // Soft fail — manager can still fill the form manually.
        return
      }
      setExtractedPath(path)
      const { data, error } = await supabase.functions.invoke('extract-lease-fields', {
        body: { storage_path: path },
      })
      if (error || !data?.ok || !data?.extracted) return
      const ex = data.extracted as {
        tenants?: Array<{ first_name: string | null; last_name: string | null; email: string | null; phone: string | null }>
        lease_start: string | null
        lease_end: string | null
        monthly_rent: number | null
        security_deposit: number | null
        property_address: string | null
        unit_number: string | null
      }
      // Pre-fill form fields. The manager can still edit anything.
      if (ex.lease_start) setLeaseStart(ex.lease_start)
      if (ex.lease_end)   setLeaseEnd(ex.lease_end)
      if (ex.monthly_rent && ex.monthly_rent > 0) setRentAmount(String(ex.monthly_rent))
      if (ex.security_deposit && ex.security_deposit > 0) setSecurityDeposit(String(ex.security_deposit))
      if (ex.tenants && ex.tenants.length > 0) {
        setTenants(ex.tenants.map((t) => ({
          email: t.email ?? '',
          first: t.first_name ?? '',
          last:  t.last_name  ?? '',
          phone: t.phone ?? '',
        })))
      }
      // Suggest a unit if we can match the extracted address+unit against
      // the manager's known units. Address-first, then unit-number narrowing.
      if (ex.property_address) {
        const norm = (s: string) => s.toLowerCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim()
        const addrMatches = units.filter((u) => norm(u.property_address) === norm(ex.property_address!))
        let pick = addrMatches[0]
        if (ex.unit_number && addrMatches.length > 1) {
          const u = addrMatches.find((u) => norm(u.unit_number) === norm(ex.unit_number!))
          if (u) pick = u
        }
        if (pick && !unitId) {
          setUnitId(pick.id)
          if (!rentAmount) setRentAmount(String(pick.rent_amount))
        }
      }
      const extractedCount = ex.tenants?.length ?? 0
      if (extractedCount > 0) {
        setExtractedAt(new Date())
        setExtractedConfirmed(false)
        toast.success(
          `Read ${extractedCount} tenant${extractedCount === 1 ? '' : 's'} + lease details from the PDF — review and confirm before saving.`,
        )
      }
    } finally {
      setExtracting(false)
    }
  }

  // When a unit is picked, suggest its rent.
  const onPickUnit = (id: string) => {
    setUnitId(id)
    const u = units.find((x) => x.id === id)
    if (u && !rentAmount) setRentAmount(String(u.rent_amount))
  }

  const canSubmit = !!pdf && !!unitId && Number(rentAmount) > 0 && leaseEnd > leaseStart
    && tenants.every((t) => t.email.trim() && /\S+@\S+\.\S+/.test(t.email) && t.first.trim() && t.last.trim())
    // If the form was auto-filled by extraction, require the manager to
    // click "Looks right" so they explicitly review the tenants. Manual
    // entry (extractedAt is null) skips this gate.
    && (!extractedAt || extractedConfirmed)

  const reset = () => {
    setPdf(null); setUnitId(''); setRentAmount(''); setSecurityDeposit('')
    setTenants([{ email: '', first: '', last: '', phone: '' }])
    setExtractedPath(null)
  }

  // Submit modes:
  //   • 'save'   (99% case) — the PDF IS the executed lease. We record the
  //               lease + tenants + PDF as a document, but DON'T send any
  //               invite emails. Manager can invite tenants later from the
  //               Tenants screen. This is the prominent default action.
  //   • 'invite' (1% case) — also send the welcome invite email immediately,
  //               same as the original behavior. Discrete secondary action.
  const submit = async (mode: 'save' | 'invite') => {
    if (!canSubmit || !pdf || !profile) return
    setSubmitting(true)
    try {
      // Reuse the path the file was already uploaded to during auto-extract,
      // otherwise upload fresh now. Either way `path` points at the live PDF.
      let path = extractedPath
      if (!path) {
        const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const safeName = pdf.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
        path = `${profile.id}/manual/${stamp}-${safeName}`
        const { error: upErr } = await supabase.storage.from('lease-documents').upload(path, pdf, {
          contentType: 'application/pdf', upsert: false,
        })
        if (upErr) { toast.error(`Upload failed: ${upErr.message}`); return }
      }

      // Call create-lease-from-pdf.
      const { data, error } = await supabase.functions.invoke('create-lease-from-pdf', {
        body: {
          unit_id: unitId,
          storage_path: path,
          filename: pdf.name,
          lease_start: leaseStart,
          lease_end: leaseEnd,
          rent_amount: Number(rentAmount),
          security_deposit: securityDeposit ? Number(securityDeposit) : null,
          tenants: tenants.map((t) => ({
            email: t.email.trim().toLowerCase(),
            first_name: t.first.trim(),
            last_name: t.last.trim(),
            phone: t.phone.replace(/\D/g, '') || null,
          })),
          skip_invite_emails: mode === 'save',
        },
      })
      if (error || !data?.ok) {
        toast.error(error?.message ?? data?.message ?? 'Could not save lease')
        return
      }
      if (mode === 'save') {
        toast.success(`Lease saved (${data.status}) with ${data.tenant_count} tenant${data.tenant_count === 1 ? '' : 's'}`)
      } else {
        toast.success(
          `Lease saved (${data.status})${data.invited_count > 0 ? ` — invited ${data.invited_count} new tenant${data.invited_count === 1 ? '' : 's'}` : ''}`,
        )
      }
      onCreated({
        lease_id: data.lease_id,
        status: data.status,
        tenant_count: data.tenant_count,
        invited_count: data.invited_count,
        filename: pdf.name,
      })
      reset()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink inline-flex items-center gap-2">
            <Plus className="w-4 h-4 text-brand-600" strokeWidth={2} />
            Add a lease for a unit not listed below
          </p>
          <p className="text-xs text-mute mt-0.5">
            For tenants whose lease wasn't in your original migration — e.g. the current tenant on a unit that
            only shows an upcoming lease. Add multiple roommates in one go.
          </p>
        </div>
        <span className="text-xs text-mute shrink-0">{open ? 'Cancel' : 'Open ▾'}</span>
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
          {/* PDF + Unit */}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">Signed lease PDF</span>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs"
              />
              {extracting && (
                <span className="inline-flex items-center gap-1 text-[11px] text-brand-700 mt-1">
                  <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                  Reading lease — extracting tenants, dates, rent…
                </span>
              )}
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">Unit</span>
              <select
                value={unitId}
                onChange={(e) => onPickUnit(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select a unit…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.property_address}{u.unit_number ? ` · Unit ${u.unit_number}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Tenants */}
          <div>
            {extractedAt && !extractedConfirmed && (
              <div className="mb-2 bg-blue-50 border border-blue-200 rounded-md p-2.5 flex items-start gap-2">
                <span className="text-blue-700 mt-0.5">📋</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-blue-900">
                    Auto-filled from the PDF — review the tenants below
                  </p>
                  <p className="text-[11px] text-blue-900/80 mt-0.5">
                    AI extraction can pick the wrong names if the PDF lists multiple parties. Confirm the list
                    looks right before saving.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExtractedConfirmed(true)}
                  className="text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded shrink-0"
                >
                  Looks right
                </button>
              </div>
            )}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wider text-mute font-semibold">
                Tenants ({tenants.length}) — first row is the primary
              </span>
              <button
                type="button"
                onClick={addTenantRow}
                className="text-[11px] font-medium text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" strokeWidth={2} />
                Add roommate
              </button>
            </div>
            <div className="space-y-1.5">
              {tenants.map((t, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 items-center bg-gray-50 border border-gray-200 rounded p-2">
                  <input
                    type="email"
                    value={t.email}
                    onChange={(e) => setTenant(i, { email: e.target.value })}
                    placeholder="email@example.com"
                    className="col-span-4 text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <input
                    type="text"
                    value={t.first}
                    onChange={(e) => setTenant(i, { first: e.target.value })}
                    placeholder="First"
                    className="col-span-3 text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <input
                    type="text"
                    value={t.last}
                    onChange={(e) => setTenant(i, { last: e.target.value })}
                    placeholder="Last"
                    className="col-span-2 text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <input
                    type="tel"
                    value={t.phone}
                    onChange={(e) => setTenant(i, { phone: e.target.value })}
                    placeholder="Phone"
                    className="col-span-2 text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <div className="col-span-1 text-right">
                    {tenants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTenantRow(i)}
                        className="text-mute hover:text-red-600"
                        aria-label="Remove tenant"
                      >
                        <XIcon className="w-3.5 h-3.5" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-mute italic mt-1.5">
              If a tenant isn't on Stoop yet, they get an invite email automatically and are added to this lease.
              All co-tenants will be able to pay rent toward the same lease.
            </p>
          </div>

          {/* Term + Rent */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">Start</span>
              <input type="date" value={leaseStart} onChange={(e) => setLeaseStart(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">End</span>
              <input type="date" value={leaseEnd} onChange={(e) => setLeaseEnd(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">Rent / mo</span>
              <input type="number" value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} placeholder="1800"
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">Deposit</span>
              <input type="number" value={securityDeposit} onChange={(e) => setSecurityDeposit(e.target.value)} placeholder="(optional)"
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
          </div>

          <div className="pt-2 border-t border-gray-100">
            {/* Primary CTA — the executed lease is being recorded into the
                system. No invite emails sent. Manager invites tenants later
                from the Tenants screen if needed. */}
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={onToggle} disabled={submitting} className="text-xs text-mute hover:text-ink px-3">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submit('save')}
                disabled={!canSubmit || submitting}
                className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg text-xs"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />}
                {submitting ? 'Saving…' : 'Save lease'}
              </button>
            </div>
            {/* Discrete secondary — for the rare case where the manager wants
                to spin up a brand-new Stoop lease + e-sign flow instead
                of just recording the executed PDF. Same edge function call,
                just with skip_invite_emails=false so welcome emails go out. */}
            <p className="text-[10px] text-mute mt-2 text-right leading-relaxed">
              The lease + PDF will be stored. Tenants get added to your account but won't get a new lease or be notified yet —
              invite them anytime from the Tenants screen.
              {' '}
              <button
                type="button"
                onClick={() => submit('invite')}
                disabled={!canSubmit || submitting}
                className="text-brand-700 hover:text-brand-800 underline disabled:opacity-40"
              >
                Or create a new lease and invite them to sign it now
              </button>
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
