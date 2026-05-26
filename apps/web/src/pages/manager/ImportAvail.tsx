// Avail-specific portfolio import. Five steps:
//   1. Rent Roll CSV → parses property + unit + co-tenant-last-names + lease
//   2. Tenant Roster CSV → parses first/last/email/phone, joined by address
//   3. Addresses → user fills city/state/ZIP (Avail doesn't export them)
//   4. Review → joined leases, "Best value" feedback gate
//   5. Done
//
// Unlike the generic flow, Avail's Rent Roll packs co-tenants into one
// row ("Sanchez-Cabrera, Kraniske, Foster, Mayer, Findlay, Gates"). We
// split on comma, look up each in the Roster, and submit a `leases[]`
// payload (new shape) where each lease carries its full tenant array.

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Upload, CheckCircle2, AlertTriangle, Loader2,
  Building2, Users, Sparkles, FileText, X as XIcon, type LucideIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  parseCsv, PROPERTY_SCHEMA, TENANT_SCHEMA,
  coerceMoney, coerceInt, coerceDateISO, normalizeState,
  splitFullName, parseFullUnitAddress, isAvailPlaceholderTenant,
  type PropertyCsvKey, type TenantCsvKey,
} from '../../lib/csvParser'
import {
  extractPdfFirstPageText, extractLeaseStartDate, scoreLeasePdfMatch,
  type LeasePdfMatch,
} from '../../lib/leasePdfMatch'

type Step = 'intro' | 'upload' | 'addresses' | 'documents' | 'review' | 'done'
type FileKind = 'rent_roll' | 'tenant_roster' | 'signed_lease' | 'unknown'

interface ClassifiedFile {
  file: File
  kind: FileKind
  // For signed_lease PDFs: lazily-extracted first-page text used to refine
  // matching when the filename alone isn't enough. Null until parsed.
  extractedText?: string | null
}

// A lease the manager added in the wizard for a tenant whose lease wasn't
// in the rent roll (typical: an upcoming/future tenant whose lease was
// already signed but hasn't started yet — Avail-style exports omit these).
// Carries the PDF file index it was created from + the target unit.
interface ExtraLease {
  id: string                    // local UUID for React keys + removal
  property_index: number        // index into propertyAddresses[]
  unit_number: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  lease_start: string           // YYYY-MM-DD
  lease_end: string             // YYYY-MM-DD
  rent_amount: number
  security_deposit: number | null
  pdf_file_index: number        // index into signedLeasePdfs[]
}

interface RentRollRow {
  raw: Record<PropertyCsvKey | TenantCsvKey, string>
  street_address: string
  unit_number: string                    // may be empty (single-family) or a building name
  tenant_last_names: string              // comma-separated, raw
  rent_amount: number | null
  security_deposit: number | null
  lease_start: string | null
  lease_end: string | null
  bedrooms: number | null
  // TRUE when lease_end is in the past — tenant has rolled to M2M.
  month_to_month: boolean
  errors: string[]
}

interface RosterRow {
  raw: Record<TenantCsvKey, string>
  street_address: string                 // parsed from full_unit_address
  unit_number: string                    // parsed from full_unit_address
  full_name: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  is_placeholder: boolean
  errors: string[]
}

interface PropertyAddress {
  street_address: string                 // canonical key
  name: string                           // editable
  city: string
  state: string                          // 2-letter
  zip: string
  unit_count: number                     // derived from rent roll
}

interface JoinedTenant {
  first_name: string
  last_name: string
  email: string
  phone: string | null
  matched: boolean                       // found in roster?
}

interface JoinedLease {
  rent_roll_index: number
  property_address: string               // unresolved street address (resolved at submit)
  unit_number: string
  rent_amount: number | null
  security_deposit: number | null
  lease_start: string | null
  lease_end: string | null
  bedrooms: number | null
  month_to_month: boolean
  tenants: JoinedTenant[]
  errors: string[]
}

interface ImportResult {
  import_id: string | null
  counts: {
    properties_created: number
    units_created: number
    tenants_invited: number
    tenants_linked: number
    leases_created: number
    leases_activated?: number
    leases_upcoming?: number
    leases_total: number
  }
  errors: Array<{ scope: string; index: number; message: string }>
}

// Compute the effective start date for a lease — the PDF's extracted
// commencement date if present (more authoritative for upcoming leases
// where the rent roll's date may be stale), else the rent roll's date.
function effectiveStartDate(
  lease: JoinedLease,
  match: LeasePdfMatch | undefined,
  pdfStartDates: (string | null)[],
): string | null {
  if (match && pdfStartDates[match.fileIndex]) return pdfStartDates[match.fileIndex]
  return lease.lease_start
}

// Classify the wizard-time status of a joined lease so the UI can show
// the same pills the server will assign. Mirrors the rules in
// import-portfolio/index.ts — keep these two in sync.
function classifyWizardStatus(
  lease: JoinedLease,
  hasPdf: boolean,
  todayIso: string,
  effectiveStart: string | null,
): 'active' | 'active_m2m' | 'upcoming' | 'pending' {
  if (lease.month_to_month) return 'active_m2m'
  if (effectiveStart && effectiveStart > todayIso && hasPdf) return 'upcoming'
  if (hasPdf) return 'active'
  return 'pending'
}

// ── Address normalization ────────────────────────────────────────────────
// Strip casing/punctuation so "301 E 14th Ave" matches "301 e 14th ave."
function normAddress(s: string): string {
  return (s ?? '').toLowerCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function ImportAvail() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('intro')
  const [rentRoll, setRentRoll] = useState<RentRollRow[]>([])
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [propertyAddresses, setPropertyAddresses] = useState<PropertyAddress[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  // PDF lease attachments — file array + per-lease assignment map.
  // matches[rentRollIndex] = LeasePdfMatch | undefined.
  const [signedLeasePdfs, setSignedLeasePdfs] = useState<File[]>([])
  const [pdfHints, setPdfHints] = useState<string[]>([])     // lowercased filename + extracted text per PDF
  // Lease commencement date extracted from each PDF (YYYY-MM-DD). Parallel
  // to signedLeasePdfs. If present, overrides the rent-roll start_date so
  // future-dated leases get classified as 'upcoming' even when the rent
  // roll lists them with a stale/incorrect past start date.
  const [pdfStartDates, setPdfStartDates] = useState<(string | null)[]>([])
  const [leasePdfMatches, setLeasePdfMatches] = useState<Record<number, LeasePdfMatch | undefined>>({})
  // Leases the manager added in the wizard for tenants/leases the rent roll
  // didn't include (e.g. an upcoming tenant whose signed lease isn't on the
  // Avail export yet). Indexed by local id.
  const [extraLeases, setExtraLeases] = useState<ExtraLease[]>([])

  // ── Parse both files in one shot (called from MultiFileUploadStep) ─────
  const parseRentRoll = async (file: File): Promise<RentRollRow[]> => {
    const text = await file.text()
    const { rows, unmatchedHeaders } = parseCsv(text, [...PROPERTY_SCHEMA, ...TENANT_SCHEMA])
    if (rows.length === 0) throw new Error('Rent Roll file had no rows.')
    if (unmatchedHeaders.length > 0) {
      // Quiet info — not fatal
      console.info('Rent Roll: unrecognized columns', unmatchedHeaders)
    }
    const today = new Date().toISOString().slice(0, 10)
    return rows.map((r) => {
      const errors: string[] = []
      const street = (r.address || r.property_match || '').trim()
      const unit = (r.unit_number || '').trim()
      const lastNames = (r.tenant_last_names || '').trim()
      if (!street) errors.push('Missing street address')
      if (!lastNames) errors.push('No tenants listed')
      const rent = coerceMoney(r.rent_amount)
      const dep = coerceMoney(r.security_deposit)
      const start = coerceDateISO(r.lease_start)
      const end = coerceDateISO(r.lease_end)
      if (rent == null) errors.push('Missing or invalid rent')
      if (!start) errors.push('Missing lease start date')
      if (!end) errors.push('Missing lease end date')
      // If lease_end is in the past, the tenant has rolled to month-to-month.
      // This isn't an error — the tenancy is still active.
      const m2m = !!(end && end < today)
      return {
        raw: r,
        street_address: street,
        unit_number: unit,
        tenant_last_names: lastNames,
        rent_amount: rent,
        security_deposit: dep,
        lease_start: start,
        lease_end: end,
        bedrooms: coerceInt(r.bedrooms),
        month_to_month: m2m,
        errors,
      }
    })
  }

  const parseTenantRoster = async (file: File): Promise<RosterRow[]> => {
    const text = await file.text()
    const { rows, unmatchedHeaders } = parseCsv(text, TENANT_SCHEMA)
    if (rows.length === 0) throw new Error('Tenant Roster file had no rows.')
    if (unmatchedHeaders.length > 0) {
      console.info('Tenant Roster: unrecognized columns', unmatchedHeaders)
    }
    return rows.map((r) => {
      const errors: string[] = []
      const full = (r.full_unit_address || '').trim()
      const { street, unit } = parseFullUnitAddress(full)
      const fullName = (r.full_name || '').trim()
      const { first, last } = splitFullName(fullName)
      const email = (r.email || '').trim().toLowerCase()
      const phone = (r.phone || '').replace(/\D/g, '') || null
      const isPlaceholder = isAvailPlaceholderTenant(fullName)
      if (!street) errors.push('Missing street address')
      if (!isPlaceholder && !email) errors.push('Missing email')
      return {
        raw: r,
        street_address: street,
        unit_number: unit,
        full_name: fullName,
        first_name: first,
        last_name: last,
        email,
        phone,
        is_placeholder: isPlaceholder,
        errors,
      }
    })
  }

  const handleFilesContinue = async (files: { rentRoll: File; roster: File; signedLeases: File[] }) => {
    try {
      const [rr, rt] = await Promise.all([parseRentRoll(files.rentRoll), parseTenantRoster(files.roster)])
      setRentRoll(rr)
      setRoster(rt)
      setPropertyAddresses(deriveAddresses(rr))
      setSignedLeasePdfs(files.signedLeases)
      setLeasePdfMatches({})  // recomputed once joinedLeases settle below

      // Build PDF hints in the background — filename now, content as it
      // extracts. The Documents step will refine matches when content lands.
      // We also extract each PDF's commencement date to override the rent
      // roll's start_date for upcoming-lease classification.
      const initialHints = files.signedLeases.map((f) => f.name.toLowerCase())
      setPdfHints(initialHints)
      setPdfStartDates(files.signedLeases.map(() => null))
      if (files.signedLeases.length > 0) {
        files.signedLeases.forEach((f, idx) => {
          void extractPdfFirstPageText(f).then((text) => {
            setPdfHints((prev) => {
              const next = [...prev]
              next[idx] = `${f.name.toLowerCase()} ${text.toLowerCase()}`
              return next
            })
            setPdfStartDates((prev) => {
              const next = [...prev]
              next[idx] = extractLeaseStartDate(text)
              return next
            })
          })
        })
      }

      setStep('addresses')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse files')
      throw err
    }
  }

  // ── Build join result on demand ─────────────────────────────────────────
  const joinedLeases = useMemo<JoinedLease[]>(() => {
    if (!rentRoll.length) return []
    // Helper: strip "Unit", "Apt", "#" etc. so "Unit 301" and "301" compare equal.
    const stripUnitWord = (s: string) =>
      (s ?? '').toLowerCase().replace(/\b(unit|apt|apartment|suite|ste|#)\b/g, '').trim()
    return rentRoll.map((rr, idx) => {
      const errors: string[] = []
      const rrLastNames = rr.tenant_last_names
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

      // The rent roll's `tenant_last_names` only lists the PRIMARY tenant most
      // of the time — co-tenants/roommates are recorded separately on the
      // tenant roster. So the authoritative tenant list for each lease is
      // "everyone in the roster at this property/unit." We pull that first,
      // then merge in any rent-roll names that didn't surface in the roster.
      const sameAddr = roster.filter((rt) =>
        !rt.is_placeholder && normAddress(rt.street_address) === normAddress(rr.street_address)
      )
      const rrUnit = stripUnitWord(rr.unit_number)
      // Narrow to matching unit when both sides have one. If the roster has
      // unit info for everyone here but none match this unit, the result is
      // empty — that's correct (those roster entries belong to a different
      // unit at the same address).
      const unitNarrowed = sameAddr.filter((rt) => {
        const rtUnit = stripUnitWord(rt.unit_number)
        if (!rrUnit && !rtUnit) return true        // both single-family
        if (!rrUnit || !rtUnit) return false        // one has unit, other doesn't
        return rrUnit === rtUnit
      })
      // If unit-narrowing yielded nothing but the rent_roll DOES have a unit,
      // fall back to address-only matches — happens when the roster export
      // didn't include unit suffixes. Manager can correct in review.
      const rosterTenants = unitNarrowed.length > 0
        ? unitNarrowed
        : (rrUnit && sameAddr.every((rt) => !stripUnitWord(rt.unit_number)) ? sameAddr : unitNarrowed)

      // Step 1: every matched roster tenant — full info.
      const matchedTenants: JoinedTenant[] = rosterTenants.map((rt) => ({
        first_name: rt.first_name,
        last_name: rt.last_name,
        email: rt.email,
        phone: rt.phone,
        matched: true,
      }))
      // Step 2: rent-roll last names that aren't covered by a roster row —
      // surface as unmatched placeholders so the manager can see them.
      const matchedLastNamesLower = new Set(matchedTenants.map((t) => t.last_name.toLowerCase()))
      const placeholderTenants: JoinedTenant[] = rrLastNames
        .filter((ln) => !matchedLastNamesLower.has(ln.toLowerCase()))
        .map((ln) => ({ first_name: '', last_name: ln, email: '', phone: null, matched: false }))
      const tenants = [...matchedTenants, ...placeholderTenants]

      const unmatchedCount = placeholderTenants.length
      if (unmatchedCount > 0) errors.push(`${unmatchedCount} co-tenant${unmatchedCount === 1 ? '' : 's'} listed on rent roll but not in Tenant Roster`)
      if (tenants.length === 0) errors.push('No tenants found for this lease')

      return {
        rent_roll_index: idx,
        property_address: rr.street_address,
        unit_number: rr.unit_number,
        rent_amount: rr.rent_amount,
        security_deposit: rr.security_deposit,
        lease_start: rr.lease_start,
        lease_end: rr.lease_end,
        bedrooms: rr.bedrooms,
        month_to_month: rr.month_to_month,
        tenants,
        errors: [...rr.errors, ...errors],
      }
    })
  }, [rentRoll, roster])

  // ── Auto-match PDFs to leases ───────────────────────────────────────────
  // Runs whenever joinedLeases or pdfHints settle. Greedy assignment: for
  // each PDF (in order), pick the highest-scoring lease that's still free
  // and exceeds the confidence threshold. Manual overrides are preserved.
  useEffect(() => {
    if (joinedLeases.length === 0 || pdfHints.length === 0) return
    setLeasePdfMatches((prev) => {
      const next: Record<number, LeasePdfMatch | undefined> = {}
      const takenFileIndexes = new Set<number>()

      // First, keep all manual assignments
      for (const [leaseIdxStr, m] of Object.entries(prev)) {
        if (m?.manuallyAssigned) {
          const leaseIdx = Number(leaseIdxStr)
          next[leaseIdx] = m
          takenFileIndexes.add(m.fileIndex)
        }
      }

      // Build score grid for unassigned files × unassigned leases
      const unassignedLeases = joinedLeases.filter((_, i) => !next[i])
      const candidates: Array<{ leaseIdx: number; fileIdx: number; score: number }> = []
      for (let f = 0; f < pdfHints.length; f++) {
        if (takenFileIndexes.has(f)) continue
        for (const lease of unassignedLeases) {
          const score = scoreLeasePdfMatch(lease, pdfHints[f])
          if (score >= 0.4) candidates.push({ leaseIdx: lease.rent_roll_index, fileIdx: f, score })
        }
      }
      // Sort descending by score, greedily pick non-conflicting assignments
      candidates.sort((a, b) => b.score - a.score)
      for (const c of candidates) {
        if (next[c.leaseIdx]) continue
        if (takenFileIndexes.has(c.fileIdx)) continue
        next[c.leaseIdx] = { fileIndex: c.fileIdx, score: c.score, manuallyAssigned: false }
        takenFileIndexes.add(c.fileIdx)
      }
      return next
    })
  }, [joinedLeases, pdfHints])

  // ── Submit ──────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!profile) return  // Loading guard renders before submit can fire, but TS doesn't know that
    // Validate addresses
    const incompleteAddresses = propertyAddresses.filter((a) => !a.city || !a.state || !a.zip)
    if (incompleteAddresses.length > 0) {
      toast.error(`Fill in city/state/ZIP for ${incompleteAddresses.length} propert${incompleteAddresses.length === 1 ? 'y' : 'ies'} first.`)
      setStep('addresses')
      return
    }

    setSubmitting(true)
    try {
      const properties = propertyAddresses.map((a) => ({
        name: a.name,
        address: a.street_address,
        city: a.city,
        state: a.state.toUpperCase(),
        zip: a.zip.replace(/[^0-9-]/g, ''),
      }))
      const addressIndex = new Map(propertyAddresses.map((a, i) => [normAddress(a.street_address), i]))

      // Upload signed-lease PDFs FIRST. Each matched (or extra-lease)
      // record carries its storage path into the import-portfolio call so
      // the server can mark the lease 'active' (or 'upcoming') and insert
      // a documents row in one transaction.
      // Path format: {manager_id}/imports/{timestamp}/{fileIdx}-{safeFilename}
      const importStamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const fileIdxToPath = new Map<number, string>()
      const uploadOne = async (fileIdx: number) => {
        if (fileIdxToPath.has(fileIdx)) return
        const file = signedLeasePdfs[fileIdx]
        if (!file) return
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
        const path = `${profile.id}/imports/${importStamp}/${fileIdx}-${safeName}`
        const { error: upErr } = await supabase.storage.from('lease-documents').upload(path, file, {
          contentType: 'application/pdf',
          upsert: false,
        })
        if (upErr) {
          toast.error(`Couldn't upload ${file.name} — ${upErr.message}`)
          return
        }
        fileIdxToPath.set(fileIdx, path)
      }
      for (const m of Object.values(leasePdfMatches)) {
        if (m) await uploadOne(m.fileIndex)
      }
      for (const e of extraLeases) {
        await uploadOne(e.pdf_file_index)
      }

      // Dedupe units across leases (multiple leases on the same unit collapse to one unit row)
      const unitsMap = new Map<string, { property_index: number; unit_number: string; rent_amount: number; bedrooms: number | null }>()
      const leasesPayload: Array<{
        property_index: number
        unit_number: string
        rent_amount: number
        security_deposit: number | null
        lease_start: string
        lease_end: string
        bedrooms: number | null
        tenants: Array<{ first_name: string; last_name: string; email: string; phone: string | null }>
        existing_lease_path?: string | null
        existing_lease_filename?: string | null
        month_to_month?: boolean
      }> = []

      for (const lease of joinedLeases) {
        if (lease.errors.some((e) => /Missing/i.test(e))) continue  // skip rows missing required fields
        const propIdx = addressIndex.get(normAddress(lease.property_address))
        if (propIdx == null || lease.rent_amount == null || !lease.lease_start || !lease.lease_end) continue
        const unitKey = `${propIdx}|${lease.unit_number.toLowerCase()}`
        if (!unitsMap.has(unitKey)) {
          unitsMap.set(unitKey, {
            property_index: propIdx,
            unit_number: lease.unit_number || '1',
            rent_amount: lease.rent_amount,
            bedrooms: lease.bedrooms,
          })
        }
        // Skip tenants without email (unmatched) — server-side filter as backup
        const validTenants = lease.tenants.filter((t) => t.email && t.first_name)
        if (validTenants.length === 0) continue

        const match = leasePdfMatches[lease.rent_roll_index]
        const pdfPath = match ? fileIdxToPath.get(match.fileIndex) ?? null : null
        const pdfFile = match ? signedLeasePdfs[match.fileIndex] : null
        // Prefer the PDF's commencement date over the rent roll's when
        // we have one — see effectiveStartDate(). This is what flips an
        // upcoming lease that the rent roll mis-recorded as "started".
        const pdfStart = match ? pdfStartDates[match.fileIndex] : null
        const effectiveLeaseStart = pdfStart ?? lease.lease_start

        leasesPayload.push({
          property_index: propIdx,
          unit_number: lease.unit_number || '1',
          rent_amount: lease.rent_amount,
          security_deposit: lease.security_deposit,
          lease_start: effectiveLeaseStart,
          lease_end: lease.lease_end,
          bedrooms: lease.bedrooms,
          tenants: validTenants.map((t) => ({
            first_name: t.first_name,
            last_name: t.last_name,
            email: t.email,
            phone: t.phone,
          })),
          existing_lease_path: pdfPath,
          existing_lease_filename: pdfFile?.name ?? null,
          // M2M only applies if start is in past AND end is in past — if
          // the PDF revealed this is actually an upcoming lease, it's
          // definitively NOT month-to-month.
          month_to_month: lease.month_to_month && !(pdfStart && pdfStart > new Date().toISOString().slice(0, 10)),
        })
      }

      // Append manager-added extra leases (typically upcoming-future-tenant
      // leases the rent roll didn't include). Each is PDF-backed.
      for (const e of extraLeases) {
        const propIdx = e.property_index
        if (propIdx < 0 || propIdx >= propertyAddresses.length) continue
        const pdfPath = fileIdxToPath.get(e.pdf_file_index) ?? null
        const pdfFile = signedLeasePdfs[e.pdf_file_index]
        // Ensure the unit appears in unitsMap. If a rent-roll lease already
        // added it, fine; otherwise we add it now using this lease's rent.
        const unitKey = `${propIdx}|${e.unit_number.toLowerCase()}`
        if (!unitsMap.has(unitKey)) {
          unitsMap.set(unitKey, {
            property_index: propIdx,
            unit_number: e.unit_number || '1',
            rent_amount: e.rent_amount,
            bedrooms: null,
          })
        }
        leasesPayload.push({
          property_index: propIdx,
          unit_number: e.unit_number || '1',
          rent_amount: e.rent_amount,
          security_deposit: e.security_deposit,
          lease_start: e.lease_start,
          lease_end: e.lease_end,
          bedrooms: null,
          tenants: [{
            first_name: e.first_name,
            last_name: e.last_name,
            email: e.email,
            phone: e.phone,
          }],
          existing_lease_path: pdfPath,
          existing_lease_filename: pdfFile?.name ?? null,
          month_to_month: false,
        })
      }

      const payload = {
        source: 'avail',
        properties,
        units: Array.from(unitsMap.values()),
        leases: leasesPayload,
      }

      const { data, error } = await supabase.functions.invoke('import-portfolio', { body: payload })
      if (error) throw new Error(error.message)
      setResult(data as ImportResult)
      setStep('done')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!profile) return <div className="p-8 text-mute">Loading…</div>

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink inline-flex items-center gap-2">
          Import from Avail
          <span className="text-[10px] uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">Tested</span>
        </h1>
        <p className="text-sm text-mute mt-1">
          Two CSVs from Avail Reports — Rent Roll + Tenant Roster — and we join them automatically.
        </p>
      </header>

      <Stepper step={step} />

      {step === 'intro' && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-ink mb-1">Before you start</h2>
          <p className="text-sm text-mute mb-5">
            You need two CSV files from Avail. Open Avail in another tab and pull these now:
          </p>
          <ol className="space-y-3 text-sm">
            {[
              { n: 1, title: 'Sign in to Avail and click Reports in the left sidebar.' },
              { n: 2, title: 'In the "Avail Reports" section, click EMAIL REPORT on Rent Roll Report. Wait for the email.' },
              { n: 3, title: 'Click EMAIL REPORT on Tenant Roster. Wait for that email too.' },
              { n: 4, title: 'Download both CSV attachments. Come back here.' },
            ].map((s) => (
              <li key={s.n} className="flex gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-brand-50 text-brand-700 text-xs font-bold inline-flex items-center justify-center">{s.n}</span>
                <p className="text-ink leading-relaxed mt-0.5">{s.title}</p>
              </li>
            ))}
          </ol>
          <div className="mt-5 bg-brand-50/60 border border-brand-200 rounded-xl p-4 text-xs text-ink leading-relaxed">
            <p className="font-semibold text-brand-700 mb-1">Heads up</p>
            <p>Avail's exports don't include city, state, or ZIP — we'll ask you to fill those in for each property after upload. Takes about 30 seconds.</p>
          </div>
          <div className="mt-6 flex justify-between">
            <Link to="/manager/import" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Different platform
            </Link>
            <button
              type="button"
              onClick={() => setStep('upload')}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium px-5 py-2.5 rounded-lg"
            >
              I have both files
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </section>
      )}

      {step === 'upload' && (
        <MultiFileUploadStep
          onContinue={handleFilesContinue}
          onBack={() => setStep('intro')}
        />
      )}

      {step === 'addresses' && (
        <AddressesStep
          addresses={propertyAddresses}
          onChange={setPropertyAddresses}
          onBack={() => { setRoster([]); setRentRoll([]); setStep('upload') }}
          onContinue={() => setStep('documents')}
        />
      )}

      {step === 'documents' && (
        <DocumentsStep
          joinedLeases={joinedLeases}
          properties={propertyAddresses}
          pdfs={signedLeasePdfs}
          matches={leasePdfMatches}
          pdfHints={pdfHints}
          pdfStartDates={pdfStartDates}
          extraLeases={extraLeases}
          onAddExtraLease={(extra) => setExtraLeases((prev) => [...prev, extra])}
          onRemoveExtraLease={(id) => setExtraLeases((prev) => prev.filter((e) => e.id !== id))}
          onAssign={(leaseIdx, fileIdx) => {
            setLeasePdfMatches((prev) => {
              const next = { ...prev }
              // Remove any existing assignment for this fileIdx elsewhere
              for (const k of Object.keys(next)) {
                if (next[Number(k)]?.fileIndex === fileIdx) delete next[Number(k)]
              }
              if (fileIdx == null) {
                delete next[leaseIdx]
              } else {
                next[leaseIdx] = { fileIndex: fileIdx, score: 1, manuallyAssigned: true }
              }
              return next
            })
          }}
          onAddPdfs={async (files) => {
            const newFiles = files.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
            if (newFiles.length === 0) return
            const startIdx = signedLeasePdfs.length
            setSignedLeasePdfs((prev) => [...prev, ...newFiles])
            setPdfHints((prev) => [...prev, ...newFiles.map((f) => f.name.toLowerCase())])
            setPdfStartDates((prev) => [...prev, ...newFiles.map(() => null)])
            newFiles.forEach((f, i) => {
              void extractPdfFirstPageText(f).then((text) => {
                setPdfHints((prev) => {
                  const next = [...prev]
                  next[startIdx + i] = `${f.name.toLowerCase()} ${text.toLowerCase()}`
                  return next
                })
                setPdfStartDates((prev) => {
                  const next = [...prev]
                  next[startIdx + i] = extractLeaseStartDate(text)
                  return next
                })
              })
            })
          }}
          onBack={() => setStep('addresses')}
          onContinue={() => setStep('review')}
        />
      )}

      {step === 'review' && (
        <ReviewStep
          properties={propertyAddresses}
          joinedLeases={joinedLeases}
          matches={leasePdfMatches}
          pdfStartDates={pdfStartDates}
          extraLeases={extraLeases}
          submitting={submitting}
          onBack={() => setStep('documents')}
          onSubmit={submit}
        />
      )}

      {step === 'done' && result && (
        <DoneStep result={result} onOpenLeases={() => navigate('/manager/leases')} onDashboard={() => navigate('/manager/dashboard')} />
      )}
    </div>
  )
}

// ── Derive unique addresses from Rent Roll ─────────────────────────────
function deriveAddresses(rentRoll: RentRollRow[]): PropertyAddress[] {
  // Group rent-roll rows by property address. unit_count is the count of
  // UNIQUE (address, unit_number) pairs — a single unit with two leases on
  // it (current + upcoming, for example) is still one unit.
  const seen = new Map<string, PropertyAddress>()
  const unitsSeen = new Map<string, Set<string>>()    // address-key → set of unit_numbers
  for (const r of rentRoll) {
    const key = normAddress(r.street_address)
    if (!key) continue
    const unitKey = (r.unit_number || '').trim().toLowerCase()
    if (!seen.has(key)) {
      seen.set(key, {
        street_address: r.street_address,
        name: r.street_address,
        city: '',
        state: '',
        zip: '',
        unit_count: 0,
      })
      unitsSeen.set(key, new Set())
    }
    const units = unitsSeen.get(key)!
    if (!units.has(unitKey)) {
      units.add(unitKey)
      seen.get(key)!.unit_count = units.size
    }
  }
  return Array.from(seen.values())
}

// ── Stepper ────────────────────────────────────────────────────────────────
function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'intro',     label: 'Start' },
    { id: 'upload',    label: 'Upload' },
    { id: 'addresses', label: 'Addresses' },
    { id: 'documents', label: 'Lease PDFs' },
    { id: 'review',    label: 'Review' },
    { id: 'done',      label: 'Done' },
  ]
  const currentIdx = steps.findIndex((s) => s.id === step)
  return (
    <nav aria-label="Avail import progress" className="flex items-center gap-2 mb-5 overflow-x-auto pb-2">
      {steps.map((s, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming'
        return (
          <div key={s.id} className="flex items-center gap-2 shrink-0">
            <div className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-bold ${
              state === 'done'    ? 'bg-emerald-100 text-emerald-700' :
              state === 'current' ? 'bg-brand-600 text-white' :
                                    'bg-gray-100 text-mute'
            }`}>
              {state === 'done' ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-xs font-medium ${state === 'current' ? 'text-ink' : 'text-mute'}`}>{s.label}</span>
            {i < steps.length - 1 && <div className="w-6 h-px bg-gray-200" aria-hidden="true" />}
          </div>
        )
      })}
    </nav>
  )
}

// ── Multi-file upload step ────────────────────────────────────────────────
// Drop CSVs + lease PDFs in one go. Wizard auto-classifies each:
//   • CSV: read header row to determine Rent Roll vs Tenant Roster
//   • PDF: treated as a signed-lease attachment — gets auto-matched to a
//     lease later (after CSVs are parsed) based on filename + content.
// Both CSV types are required before Continue enables. PDFs are optional —
// leases without a PDF land in "pending" status with a "needs lease" flag.
async function classifyFile(f: File): Promise<FileKind> {
  if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') return 'signed_lease'
  // Read the first 2KB only — header row is the only thing we need.
  const head = (await f.slice(0, 2048).text()).split(/\r?\n/)[0]?.toLowerCase() ?? ''
  if (head.includes('tenant_last_names') || head.includes('monthly_rent') || head.includes('reporting_security_deposit')) return 'rent_roll'
  if (head.includes('current_leased_unit_full_address') || head.includes('bank_account_added') || head.includes('valid_credit_card')) return 'tenant_roster'
  return 'unknown'
}

const FILE_KIND_META: Record<FileKind, { label: string; tone: string }> = {
  rent_roll:     { label: 'Rent Roll Report',  tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  tenant_roster: { label: 'Tenant Roster',     tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  signed_lease:  { label: 'Signed Lease',      tone: 'bg-violet-50 text-violet-700 border-violet-200' },
  unknown:       { label: 'Unrecognized',      tone: 'bg-amber-50 text-amber-800 border-amber-200' },
}

function MultiFileUploadStep({ onContinue, onBack }: {
  onContinue: (files: { rentRoll: File; roster: File; signedLeases: File[] }) => Promise<void>
  onBack: () => void
}) {
  const [files, setFiles] = useState<ClassifiedFile[]>([])
  const [parsing, setParsing] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const addFiles = async (incoming: File[]) => {
    const next: ClassifiedFile[] = []
    for (const f of incoming) {
      const isCsv = /\.csv$/i.test(f.name) || f.type === 'text/csv' || f.type === 'application/vnd.ms-excel'
      const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf'
      if (!isCsv && !isPdf) { toast.error(`${f.name} isn't a CSV or PDF — skipped.`); continue }
      const kind = await classifyFile(f)
      next.push({ file: f, kind })
    }
    if (next.length === 0) return
    setFiles((prev) => {
      const merged = [...prev]
      for (const entry of next) {
        // Signed-lease PDFs and unknown files: append (no dedupe).
        // CSV kinds: replace existing of same kind so the user can swap files.
        if (entry.kind === 'unknown' || entry.kind === 'signed_lease') {
          // De-dupe PDFs by filename + size to avoid the user adding twice
          if (entry.kind === 'signed_lease') {
            const dup = merged.findIndex((m) => m.kind === 'signed_lease'
              && m.file.name === entry.file.name && m.file.size === entry.file.size)
            if (dup >= 0) continue
          }
          merged.push(entry)
          continue
        }
        const existingIdx = merged.findIndex((m) => m.kind === entry.kind)
        if (existingIdx >= 0) merged[existingIdx] = entry
        else merged.push(entry)
      }
      return merged
    })
  }

  const removeAt = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i))

  const rentRoll = files.find((f) => f.kind === 'rent_roll')?.file ?? null
  const roster   = files.find((f) => f.kind === 'tenant_roster')?.file ?? null
  const signedLeases = files.filter((f) => f.kind === 'signed_lease').map((f) => f.file)
  const canContinue = !!rentRoll && !!roster && !parsing

  const handleContinue = async () => {
    if (!canContinue || !rentRoll || !roster) return
    setParsing(true)
    try { await onContinue({ rentRoll, roster, signedLeases }) }
    catch { /* parent toasted */ }
    finally { setParsing(false) }
  }

  const onDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    if (!isDragOver) setIsDragOver(true)
  }
  const onDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const dropped = Array.from(e.dataTransfer?.files ?? [])
    if (dropped.length > 0) void addFiles(dropped)
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-ink">Pick your Avail exports</h2>
      <p className="text-sm text-mute mt-1 mb-5">
        Drop the Rent Roll, Tenant Roster, and <strong>any signed lease PDFs you already have</strong> all in
        one go — we'll figure out which is which and match each PDF to a lease.
      </p>

      <label
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`block w-full rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
          isDragOver
            ? 'border-brand-500 bg-brand-50'
            : 'border-gray-300 hover:border-brand-400 bg-white'
        }`}
      >
        <input
          type="file"
          multiple
          accept=".csv,.pdf"
          onChange={(e) => { if (e.target.files) void addFiles(Array.from(e.target.files)); e.target.value = '' }}
          className="sr-only"
        />
        <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragOver ? 'text-brand-600' : 'text-mute'}`} strokeWidth={1.75} />
        <p className="text-sm font-medium text-ink">
          {isDragOver
            ? 'Drop to load'
            : files.length === 0
              ? 'Click — or drag your Avail CSVs + lease PDFs here'
              : 'Add another file (click or drag)'}
        </p>
        <p className="text-xs text-mute mt-1">
          You can pick multiple at once with Ctrl/⌘ + click — CSVs and PDFs both welcome
        </p>
      </label>

      {/* File list */}
      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((entry, i) => {
            const meta = FILE_KIND_META[entry.kind]
            return (
              <li
                key={`${entry.file.name}-${i}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                  entry.kind === 'unknown' ? 'border-amber-200 bg-amber-50/40' :
                  entry.kind === 'signed_lease' ? 'border-violet-200 bg-violet-50/40' :
                  'border-emerald-200 bg-emerald-50/40'
                }`}
              >
                {entry.kind === 'unknown'
                  ? <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" strokeWidth={2} />
                  : entry.kind === 'signed_lease'
                    ? <FileText className="w-4 h-4 text-violet-700 shrink-0" strokeWidth={2} />
                    : <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={2} />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{entry.file.name}</p>
                  <p className="text-[11px] text-mute">{(entry.file.size / 1024).toFixed(1)} KB</p>
                </div>
                <span className={`inline-flex text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${meta.tone}`}>
                  {meta.label}
                </span>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="text-xs text-mute hover:text-ink font-medium px-2 py-1 rounded hover:bg-white/60"
                  aria-label={`Remove ${entry.file.name}`}
                >
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Readiness indicator */}
      <div className="mt-4 grid sm:grid-cols-3 gap-2 text-xs">
        <ReadyChip label="Rent Roll Report" satisfied={!!rentRoll} />
        <ReadyChip label="Tenant Roster"    satisfied={!!roster} />
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border ${
          signedLeases.length > 0 ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-gray-50 border-gray-200 text-mute'
        }`}>
          <FileText className="w-3.5 h-3.5" strokeWidth={2} />
          <span className="font-medium">{signedLeases.length} signed lease{signedLeases.length === 1 ? '' : 's'} <span className="text-mute font-normal">(optional)</span></span>
        </div>
      </div>
      {files.some((f) => f.kind === 'unknown') && (
        <p className="mt-3 text-xs text-amber-800">
          One or more files weren't recognized — they were probably exported from somewhere else.
          Remove them or replace with the matching Avail report.
        </p>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg"
        >
          {parsing ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> : null}
          {parsing ? 'Reading…' : 'Continue'}
          {!parsing && <ArrowRight className="w-4 h-4" strokeWidth={2} />}
        </button>
      </div>
    </section>
  )
}

function ReadyChip({ label, satisfied }: { label: string; satisfied: boolean }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border ${
      satisfied ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-mute'
    }`}>
      {satisfied
        ? <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
        : <span className="w-3.5 h-3.5 rounded-full border border-gray-300" aria-hidden="true" />}
      <span className="font-medium">{label}</span>
    </div>
  )
}

// ── Addresses step — auto-geocoded, manually correctable ─────────────────
// On mount we fan out one geocode-address call per unique property to
// auto-fill city/state/zip. The user can still edit any field. A per-row
// status badge shows whether the row was geocoded, edited, or failed.
interface GeocodeStatus {
  state: 'idle' | 'loading' | 'ok' | 'edited' | 'failed'
  confidence?: string | null
  formatted?: string | null
  message?: string | null
}

function AddressesStep({ addresses, onChange, onBack, onContinue }: {
  addresses: PropertyAddress[]
  onChange: (next: PropertyAddress[]) => void
  onBack: () => void
  onContinue: () => void
}) {
  const [geocodeStatus, setGeocodeStatus] = useState<Record<string, GeocodeStatus>>({})

  // Keep a ref of the latest addresses so async geocode callbacks finishing
  // in any order all merge into the current array (instead of closing over
  // a stale snapshot).
  const addressesRef = useRef(addresses)
  useEffect(() => { addressesRef.current = addresses }, [addresses])

  const update = (i: number, patch: Partial<PropertyAddress>) => {
    const next = [...addresses]
    const prev = next[i]
    next[i] = { ...prev, ...patch }
    onChange(next)
    if (patch.city != null || patch.state != null || patch.zip != null) {
      setGeocodeStatus((s) => ({ ...s, [prev.street_address]: { ...(s[prev.street_address] ?? { state: 'idle' }), state: 'edited' } }))
    }
  }

  // Auto-geocode any row that's still blank. Re-mounting (back/forward in
  // the wizard) shouldn't re-bill Google for rows we've already filled —
  // hence the !city && !state && !zip guard.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const toGeocode = addresses.filter((a) => !a.city && !a.state && !a.zip)
    if (toGeocode.length === 0) return

    setGeocodeStatus((s) => {
      const next = { ...s }
      for (const a of toGeocode) next[a.street_address] = { state: 'loading' }
      return next
    })

    void Promise.all(toGeocode.map(async (a) => {
      try {
        const { data, error } = await supabase.functions.invoke('geocode-address', {
          body: { address: a.street_address },
        })
        if (error || !data?.ok || !data?.result) {
          setGeocodeStatus((s) => ({ ...s, [a.street_address]: { state: 'failed', message: data?.message ?? error?.message ?? 'No match' } }))
          return
        }
        const r = data.result as { city: string | null; state: string | null; zip: string | null; formatted_address: string | null; confidence: string | null }
        onChange(
          addressesRef.current.map((row) =>
            row.street_address === a.street_address
              ? {
                  ...row,
                  city:  row.city  || r.city  || '',
                  state: row.state || r.state || '',
                  zip:   row.zip   || r.zip   || '',
                }
              : row,
          ),
        )
        setGeocodeStatus((s) => ({
          ...s,
          [a.street_address]: { state: 'ok', confidence: r.confidence, formatted: r.formatted_address },
        }))
      } catch (e) {
        setGeocodeStatus((s) => ({ ...s, [a.street_address]: { state: 'failed', message: e instanceof Error ? e.message : 'failed' } }))
      }
    }))
  }, [])

  const allFilled = addresses.every((a) => a.city.trim() && a.state.trim() && a.zip.trim())
  const anyLoading = Object.values(geocodeStatus).some((s) => s.state === 'loading')

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-ink inline-flex items-center gap-2">
        Verify property addresses
        {anyLoading && <Loader2 className="w-4 h-4 animate-spin text-mute" strokeWidth={2} />}
      </h2>
      <p className="text-sm text-mute mt-1 mb-5">
        Avail doesn't export city, state, or ZIP — we're looking them up via Google for you. Review and correct anything that's off.
      </p>
      <div className="space-y-3">
        {addresses.map((a, i) => {
          const status = geocodeStatus[a.street_address]
          return (
            <div key={a.street_address} className="bg-gray-50/70 border border-gray-200 rounded-xl p-4">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm font-semibold text-ink">{a.street_address}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-mute uppercase tracking-wider font-semibold">{a.unit_count} unit{a.unit_count === 1 ? '' : 's'}</span>
                  <GeocodeBadge status={status} />
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <LabeledInput label="City"     value={a.city}   onChange={(v) => update(i, { city: v })}   placeholder="Columbus" />
                <LabeledInput label="State"    value={a.state}  onChange={(v) => update(i, { state: normalizeState(v) ?? v.toUpperCase() })} placeholder="OH" maxLength={2} />
                <LabeledInput label="ZIP"      value={a.zip}    onChange={(v) => update(i, { zip: v })}    placeholder="43215" />
              </div>
              <div className="mt-2">
                <LabeledInput label="Property name (optional)" value={a.name} onChange={(v) => update(i, { name: v })} placeholder={a.street_address} />
              </div>
              {status?.formatted && (
                <p className="text-[10px] text-mute mt-2 italic truncate">
                  Google matched: {status.formatted}
                </p>
              )}
              {status?.state === 'failed' && (
                <p className="text-[11px] text-amber-700 mt-2">
                  Couldn't auto-find this one ({status.message ?? 'no match'}). Type it in manually.
                </p>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-6 flex justify-between items-center">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!allFilled || anyLoading}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg"
        >
          Continue
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </section>
  )
}

function GeocodeBadge({ status }: { status?: GeocodeStatus }) {
  if (!status || status.state === 'idle') return null
  if (status.state === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-mute bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">
        <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
        Looking up
      </span>
    )
  }
  if (status.state === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full" title={status.confidence ?? undefined}>
        <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
        Auto-filled
      </span>
    )
  }
  if (status.state === 'edited') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-700 bg-brand-50 border border-brand-200 px-1.5 py-0.5 rounded-full">
        Edited
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
      <AlertTriangle className="w-3 h-3" strokeWidth={2} />
      Manual
    </span>
  )
}

// ── Documents step — assign signed-lease PDFs to leases ──────────────────
// Each valid lease shows a row with its auto-matched PDF (if any). Manager
// can swap to another PDF, clear it, or upload more PDFs to a small drop
// zone at the top. Leftover (unassigned) PDFs are shown below the list so
// nothing silently goes missing.
function DocumentsStep({ joinedLeases, properties, pdfs, matches, pdfHints, pdfStartDates, extraLeases, onAssign, onAddPdfs, onAddExtraLease, onRemoveExtraLease, onBack, onContinue }: {
  joinedLeases: JoinedLease[]
  properties: PropertyAddress[]
  pdfs: File[]
  matches: Record<number, LeasePdfMatch | undefined>
  pdfHints: string[]
  pdfStartDates: (string | null)[]
  extraLeases: ExtraLease[]
  onAssign: (leaseIdx: number, fileIdx: number | null) => void
  onAddPdfs: (files: File[]) => void | Promise<void>
  onAddExtraLease: (extra: ExtraLease) => void
  onRemoveExtraLease: (id: string) => void
  onBack: () => void
  onContinue: () => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)

  // Skip leases that won't import — there's nothing to attach a PDF to.
  const importableLeases = joinedLeases.filter((l) => !l.errors.some((e) => /Missing/i.test(e)))
  const assignedFileIdxs = new Set<number>([
    ...Object.values(matches).filter((m): m is LeasePdfMatch => !!m).map((m) => m.fileIndex),
    ...extraLeases.map((e) => e.pdf_file_index),
  ])
  const unassignedPdfs = pdfs
    .map((f, i) => ({ file: f, idx: i }))
    .filter((p) => !assignedFileIdxs.has(p.idx))

  const todayIso = new Date().toISOString().slice(0, 10)
  const statusCounts = { active: 0, active_m2m: 0, upcoming: 0, pending: 0 }
  // Per-lease effective start (PDF-overridden) + wizard status, computed
  // once and reused across the summary, conflict check, and row rendering.
  const perLease = new Map<number, { effStart: string | null; status: 'active' | 'active_m2m' | 'upcoming' | 'pending' }>()
  for (const l of importableLeases) {
    const m = matches[l.rent_roll_index]
    const effStart = effectiveStartDate(l, m, pdfStartDates)
    const status = classifyWizardStatus(l, !!m, todayIso, effStart)
    perLease.set(l.rent_roll_index, { effStart, status })
    statusCounts[status]++
  }
  // Extra leases are always PDF-backed; classify them by their start_date.
  for (const e of extraLeases) {
    statusCounts[e.lease_start > todayIso ? 'upcoming' : 'active']++
  }
  // Detect units with overlapping CURRENT leases — that's a data conflict
  // (only one tenant can occupy a unit at a time). Upcoming + active on the
  // same unit is fine; two active OR two month-to-month is not.
  const unitConflicts = new Set<string>()
  const liveByUnit = new Map<string, number>()
  for (const l of importableLeases) {
    const s = perLease.get(l.rent_roll_index)?.status
    if (s === 'active' || s === 'active_m2m') {
      const k = `${normAddress(l.property_address)}|${l.unit_number.toLowerCase()}`
      const c = (liveByUnit.get(k) ?? 0) + 1
      liveByUnit.set(k, c)
      if (c > 1) unitConflicts.add(k)
    }
  }

  const handleDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault(); e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    if (!isDragOver) setIsDragOver(true)
  }
  const handleDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
  }
  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
    const dropped = Array.from(e.dataTransfer?.files ?? [])
    if (dropped.length > 0) void onAddPdfs(dropped)
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-ink">Match signed leases to tenants</h2>
      <p className="text-sm text-mute mt-1 mb-5">
        Tenants with an existing signed lease keep their current agreement —
        no need to re-sign because you migrated. Drop in any PDFs you have;
        we'll match them to the right lease.
      </p>

      <div className="grid sm:grid-cols-4 gap-2 mb-5 text-xs">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2">
          <p className="font-bold text-emerald-700 text-lg leading-tight">{statusCounts.active}</p>
          <p className="text-emerald-700/80 text-[11px]"><strong>Active</strong><br/><span className="text-emerald-700/60">signed, in-term</span></p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
          <p className="font-bold text-amber-800 text-lg leading-tight">{statusCounts.active_m2m}</p>
          <p className="text-amber-800/80 text-[11px]"><strong>Month-to-month</strong><br/><span className="text-amber-800/60">term ended, still here</span></p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-2">
          <p className="font-bold text-blue-700 text-lg leading-tight">{statusCounts.upcoming}</p>
          <p className="text-blue-700/80 text-[11px]"><strong>Upcoming</strong><br/><span className="text-blue-700/60">signed, future start</span></p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2">
          <p className="font-bold text-ink text-lg leading-tight">{statusCounts.pending}</p>
          <p className="text-mute text-[11px]"><strong>Pending</strong><br/><span className="text-mute/80">needs FindStoop lease</span></p>
        </div>
      </div>

      {unitConflicts.size > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-xs text-red-900">
          <p className="font-semibold inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
            {unitConflicts.size} unit{unitConflicts.size === 1 ? '' : 's'} with overlapping current leases
          </p>
          <p className="mt-1 text-[11px] leading-relaxed">
            Two or more leases on the same unit are both classified as currently-active or month-to-month —
            but a unit can only have one current tenant. <strong>Upcoming</strong> (signed, future start) +
            Active on the same unit is fine; two Actives is not. Adjust the rent roll or split into separate
            units before importing.
          </p>
        </div>
      )}

      {/* Diagnostic: show what we read from each PDF. Helps figure out why
          a lease didn't reclassify when the manager expected it to. */}
      {pdfs.length > 0 && (
        <details className="mb-4 text-xs">
          <summary className="cursor-pointer text-mute hover:text-ink select-none font-medium inline-flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />
            What we read from each PDF ({pdfs.length})
          </summary>
          <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
            {pdfs.map((f, i) => {
              const hint = pdfHints[i] ?? ''
              const startDate = pdfStartDates[i]
              const textLen = Math.max(0, hint.length - f.name.length - 1)
              const preview = hint.slice(f.name.length + 1, f.name.length + 401)
              return (
                <div key={i} className="p-2.5">
                  <p className="font-mono text-[10px] text-ink truncate">{f.name}</p>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
                    <p><span className="text-mute">Extracted date:</span> <strong className={startDate ? 'text-emerald-700' : 'text-amber-700'}>{startDate ?? 'NONE FOUND'}</strong></p>
                    <p><span className="text-mute">Text length:</span> <strong className={textLen > 100 ? 'text-emerald-700' : 'text-amber-700'}>{textLen} chars</strong></p>
                  </div>
                  {textLen === 0 ? (
                    <p className="mt-1 text-amber-800 text-[11px]">
                      No text extracted — likely a scanned/image PDF. Without text, we can't read the term dates.
                    </p>
                  ) : !startDate ? (
                    <p className="mt-1 text-amber-800 text-[11px]">
                      Text extracted but no date matched our patterns near a term keyword. First chars of the text:
                    </p>
                  ) : null}
                  {preview && (
                    <p className="mt-1 text-[10px] font-mono italic bg-gray-50 p-1.5 rounded max-h-24 overflow-y-auto whitespace-pre-wrap">
                      {preview}{textLen > 400 ? '…' : ''}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </details>
      )}

      {/* Optional drop more PDFs */}
      <label
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`block w-full rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors mb-5 ${
          isDragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-brand-400 bg-white'
        }`}
      >
        <input
          type="file"
          multiple
          accept=".pdf"
          onChange={(e) => { if (e.target.files) void onAddPdfs(Array.from(e.target.files)); e.target.value = '' }}
          className="sr-only"
        />
        <p className="text-xs font-medium text-ink">
          <Upload className="w-3.5 h-3.5 inline mr-1 -mt-0.5" strokeWidth={1.75} />
          Drop more lease PDFs here, or click to add
        </p>
      </label>

      {/* Per-lease list */}
      <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1 mb-5">
        {importableLeases.map((lease) => {
          const match = matches[lease.rent_roll_index]
          const file = match ? pdfs[match.fileIndex] : null
          const info = perLease.get(lease.rent_roll_index)
          const wizardStatus = info?.status ?? 'pending'
          const pdfDate = match ? pdfStartDates[match.fileIndex] : null
          const dateOverridden = pdfDate && pdfDate !== lease.lease_start
          return (
            <div key={lease.rent_roll_index} className="bg-gray-50/70 border border-gray-200 rounded-xl p-3">
              <div className="flex items-baseline justify-between gap-3 mb-0.5">
                <div className="flex items-baseline gap-2 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">
                    {lease.property_address}{lease.unit_number ? ` · Unit ${lease.unit_number}` : ''}
                  </p>
                  <WizardStatusPill status={wizardStatus} />
                </div>
                <p className="text-[10px] text-mute uppercase tracking-wider font-semibold shrink-0">
                  {lease.tenants.map((t) => t.last_name).filter(Boolean).join(', ')}
                </p>
              </div>
              <p className="text-[11px] text-mute mb-1.5">
                {info?.effStart ?? lease.lease_start ?? '?'} → {lease.lease_end ?? '?'}
                {dateOverridden && (
                  <span className="ml-2 text-blue-700 italic">
                    (PDF says {pdfDate}, overriding rent roll {lease.lease_start ?? '?'})
                  </span>
                )}
              </p>
              {file ? (
                <div className="flex items-center gap-2 bg-white border border-violet-200 rounded-md px-2.5 py-1.5">
                  <FileText className="w-4 h-4 text-violet-700 shrink-0" strokeWidth={2} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-ink truncate">{file.name}</p>
                    <p className="text-[10px] text-mute">
                      {(file.size / 1024).toFixed(0)} KB · {match?.manuallyAssigned
                        ? 'You picked this'
                        : `Auto-matched (${Math.round((match?.score ?? 0) * 100)}%)`}
                    </p>
                  </div>
                  <select
                    value={match?.fileIndex ?? ''}
                    onChange={(e) => onAssign(lease.rent_roll_index, e.target.value === '' ? null : Number(e.target.value))}
                    className="text-[11px] border border-gray-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {pdfs.map((p, i) => (
                      <option key={i} value={i}>{p.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onAssign(lease.rent_roll_index, null)}
                    className="p-1 rounded hover:bg-gray-100 text-mute hover:text-ink"
                    aria-label="Remove PDF assignment"
                  >
                    <XIcon className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-mute">
                  <span className="italic">No signed lease — will be Pending</span>
                  {unassignedPdfs.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => { if (e.target.value !== '') onAssign(lease.rent_roll_index, Number(e.target.value)) }}
                      className="text-[11px] border border-gray-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Pick a PDF…</option>
                      {unassignedPdfs.map((p) => (
                        <option key={p.idx} value={p.idx}>{p.file.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Extra leases the manager added in this step (rendered above
          unassigned so they're easier to find / undo). */}
      {extraLeases.length > 0 && (
        <div className="mb-5">
          <p className="text-xs text-mute font-semibold uppercase tracking-wider mb-2">
            Added in this step ({extraLeases.length})
          </p>
          <ul className="space-y-2">
            {extraLeases.map((e) => {
              const prop = properties[e.property_index]
              const file = pdfs[e.pdf_file_index]
              const isUpcoming = e.lease_start > todayIso
              return (
                <li key={e.id} className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 text-xs">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <p className="font-semibold text-ink truncate">
                        {prop?.street_address ?? '?'}{e.unit_number ? ` · Unit ${e.unit_number}` : ''}
                      </p>
                      <WizardStatusPill status={isUpcoming ? 'upcoming' : 'active'} />
                      <span className="text-[10px] text-mute">{e.first_name} {e.last_name} · {e.email}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveExtraLease(e.id)}
                      className="text-mute hover:text-red-600 inline-flex items-center gap-1"
                    >
                      <XIcon className="w-3.5 h-3.5" strokeWidth={2} /> Remove
                    </button>
                  </div>
                  <p className="text-mute">
                    {e.lease_start} → {e.lease_end} · ${e.rent_amount.toLocaleString()}/mo · {file?.name ?? 'PDF missing'}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Leftover (unassigned) PDFs — manager can match them to existing
          leases via the dropdowns above OR create a new lease right here. */}
      {unassignedPdfs.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-amber-900 mb-2">
            {unassignedPdfs.length} PDF{unassignedPdfs.length === 1 ? '' : 's'} not matched to any lease
          </p>
          <p className="text-[11px] text-amber-900/80 mb-3">
            If the rent roll didn't include the tenant (common for upcoming/future-dated leases that haven't started yet),
            click <strong>Create lease from this PDF</strong> to add it.
          </p>
          <ul className="space-y-2">
            {unassignedPdfs.map((p) => (
              <UnmatchedPdfRow
                key={p.idx}
                file={p.file}
                fileIndex={p.idx}
                pdfStartDate={pdfStartDates[p.idx]}
                properties={properties}
                joinedLeases={joinedLeases}
                onCreate={onAddExtraLease}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-between items-center">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={unitConflicts.size > 0}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg"
        >
          Continue
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </section>
  )
}

// Inline "create lease from this PDF" form rendered under each unmatched
// PDF in the Documents step. Pre-fills with sensible defaults pulled from
// the PDF + the matching property: extracted start date, +12 months end
// date, and rent from any existing lease on that unit.
function UnmatchedPdfRow({ file, fileIndex, pdfStartDate, properties, joinedLeases, onCreate }: {
  file: File
  fileIndex: number
  pdfStartDate: string | null
  properties: PropertyAddress[]
  joinedLeases: JoinedLease[]
  onCreate: (extra: ExtraLease) => void
}) {
  const [open, setOpen] = useState(false)
  const todayIso = new Date().toISOString().slice(0, 10)
  // Default start = PDF's extracted commencement date, else today.
  const defaultStart = pdfStartDate ?? todayIso
  // Default end = start + 12 months.
  const defaultEnd = (() => {
    const d = new Date(defaultStart + 'T00:00:00Z')
    d.setUTCFullYear(d.getUTCFullYear() + 1)
    return d.toISOString().slice(0, 10)
  })()

  const [propIdx, setPropIdx] = useState<number | ''>('')
  const [unitNumber, setUnitNumber] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [leaseStart, setLeaseStart] = useState(defaultStart)
  const [leaseEnd, setLeaseEnd] = useState(defaultEnd)
  const [rentAmount, setRentAmount] = useState('')
  const [securityDeposit, setSecurityDeposit] = useState('')

  // When the user picks a property, suggest the most-common unit + rent
  // from existing rent-roll leases on that property.
  const onPickProperty = (idx: number | '') => {
    setPropIdx(idx)
    if (idx === '') return
    const prop = properties[idx]
    // Default to the first unit_number we've seen at this property.
    const leasesAtProp = joinedLeases.filter((l) => normAddress(l.property_address) === normAddress(prop.street_address))
    if (leasesAtProp[0]) {
      if (!unitNumber) setUnitNumber(leasesAtProp[0].unit_number)
      if (!rentAmount && leasesAtProp[0].rent_amount) setRentAmount(String(leasesAtProp[0].rent_amount))
    }
  }

  const canSave = propIdx !== '' && firstName.trim() && lastName.trim() && email.trim()
    && /\S+@\S+\.\S+/.test(email.trim()) && leaseStart && leaseEnd
    && Number(rentAmount) > 0 && leaseEnd > leaseStart

  const save = () => {
    if (!canSave) return
    onCreate({
      id: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      property_index: propIdx as number,
      unit_number: unitNumber.trim(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: null,
      lease_start: leaseStart,
      lease_end: leaseEnd,
      rent_amount: Number(rentAmount),
      security_deposit: securityDeposit ? Number(securityDeposit) : null,
      pdf_file_index: fileIndex,
    })
    setOpen(false)
  }

  return (
    <li className="bg-white border border-amber-200 rounded-lg">
      <div className="flex items-center gap-2 px-3 py-2">
        <FileText className="w-4 h-4 text-amber-700 shrink-0" strokeWidth={2} />
        <span className="flex-1 min-w-0 truncate text-xs font-medium text-ink">{file.name}</span>
        {pdfStartDate && (
          <span className="text-[10px] text-mute italic shrink-0">PDF says starts {pdfStartDate}</span>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-[11px] font-medium text-brand-700 hover:text-brand-800 px-2 py-1 rounded hover:bg-brand-50"
        >
          {open ? 'Cancel' : 'Create lease from this PDF'}
        </button>
      </div>
      {open && (
        <div className="border-t border-amber-200 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-amber-50/30">
          <label className="block col-span-2">
            <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">Property</span>
            <select
              value={propIdx}
              onChange={(e) => onPickProperty(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select…</option>
              {properties.map((p, i) => (<option key={i} value={i}>{p.street_address}</option>))}
            </select>
          </label>
          <label className="block col-span-2">
            <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">Unit</span>
            <input
              type="text"
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              placeholder="e.g. 301 (blank for single-family)"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">First name</span>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">Last name</span>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </label>
          <label className="block col-span-2">
            <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tenant@example.com" className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">Start</span>
            <input type="date" value={leaseStart} onChange={(e) => setLeaseStart(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">End</span>
            <input type="date" value={leaseEnd} onChange={(e) => setLeaseEnd(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">Rent / mo</span>
            <input type="number" value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} placeholder="1500" className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">Deposit</span>
            <input type="number" value={securityDeposit} onChange={(e) => setSecurityDeposit(e.target.value)} placeholder="optional" className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </label>
          <div className="col-span-2 sm:col-span-4 flex justify-end mt-1">
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded text-xs"
            >
              Add lease
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function WizardStatusPill({ status }: { status: 'active' | 'active_m2m' | 'upcoming' | 'pending' }) {
  const meta = {
    active:     { label: 'Active',         tone: 'text-emerald-700 bg-emerald-100 border-emerald-200' },
    active_m2m: { label: 'Month-to-month', tone: 'text-amber-800 bg-amber-100 border-amber-200' },
    upcoming:   { label: 'Upcoming',       tone: 'text-blue-700 bg-blue-100 border-blue-200' },
    pending:    { label: 'Pending',        tone: 'text-mute bg-gray-100 border-gray-200' },
  }[status]
  return (
    <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${meta.tone}`}>
      {meta.label}
    </span>
  )
}

function LabeledInput({ label, value, onChange, placeholder, maxLength }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-mute font-semibold mb-1">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </label>
  )
}

// ── Review step ────────────────────────────────────────────────────────────
function ReviewStep({ properties, joinedLeases, matches, pdfStartDates, extraLeases, submitting, onBack, onSubmit }: {
  properties: PropertyAddress[]
  joinedLeases: JoinedLease[]
  matches: Record<number, LeasePdfMatch | undefined>
  pdfStartDates: (string | null)[]
  extraLeases: ExtraLease[]
  submitting: boolean
  onBack: () => void
  onSubmit: () => void
}) {
  const totalTenants = joinedLeases.reduce((sum, l) => sum + l.tenants.length, 0) + extraLeases.length
  const matchedTenants = joinedLeases.reduce((sum, l) => sum + l.tenants.filter((t) => t.matched).length, 0) + extraLeases.length
  const unmatchedTenants = totalTenants - matchedTenants
  const leasesWithErrors = joinedLeases.filter((l) => l.errors.length > 0).length
  const validLeases = joinedLeases.filter((l) => !l.errors.some((e) => /Missing/i.test(e)))
  const validLeaseCount = validLeases.length + extraLeases.length
  const todayIso = new Date().toISOString().slice(0, 10)
  const statusCounts = { active: 0, active_m2m: 0, upcoming: 0, pending: 0 }
  for (const l of validLeases) {
    const m = matches[l.rent_roll_index]
    const effStart = effectiveStartDate(l, m, pdfStartDates)
    statusCounts[classifyWizardStatus(l, !!m, todayIso, effStart)]++
  }
  for (const e of extraLeases) {
    statusCounts[e.lease_start > todayIso ? 'upcoming' : 'active']++
  }
  const stripeBumpCount = statusCounts.active + statusCounts.active_m2m  // upcoming doesn't bill until move-in

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-ink">Review and confirm</h2>
      <p className="text-sm text-mute mt-1 mb-5">
        Each lease imports into the state that matches reality — Active, Month-to-month, Upcoming, or Pending.
      </p>

      <div className="grid sm:grid-cols-4 gap-3 mb-3">
        <SummaryCard Icon={Building2} label="Properties" value={properties.length} />
        <SummaryCard Icon={Building2} label="Units"      value={countUniqueUnits(joinedLeases)} />
        <SummaryCard Icon={FileText}  label="Leases"     value={validLeaseCount} sub={`${joinedLeases.length} parsed`} />
        <SummaryCard Icon={Users}     label="Tenants"    value={matchedTenants} sub={`${unmatchedTenants} unmatched`} />
      </div>

      <div className="grid sm:grid-cols-4 gap-2 mb-5 text-xs">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2">
          <p className="font-bold text-emerald-700 text-lg leading-tight">{statusCounts.active}</p>
          <p className="text-emerald-700/80 text-[11px]"><strong>Active</strong></p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
          <p className="font-bold text-amber-800 text-lg leading-tight">{statusCounts.active_m2m}</p>
          <p className="text-amber-800/80 text-[11px]"><strong>Month-to-month</strong></p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-2">
          <p className="font-bold text-blue-700 text-lg leading-tight">{statusCounts.upcoming}</p>
          <p className="text-blue-700/80 text-[11px]"><strong>Upcoming</strong></p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2">
          <p className="font-bold text-ink text-lg leading-tight">{statusCounts.pending}</p>
          <p className="text-mute text-[11px]"><strong>Pending</strong></p>
        </div>
      </div>

      {unmatchedTenants > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 text-sm">
          <p className="font-semibold text-amber-900 inline-flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" strokeWidth={1.75} />
            {unmatchedTenants} co-tenant{unmatchedTenants === 1 ? '' : 's'} couldn't be matched to the Tenant Roster
          </p>
          <p className="text-xs text-amber-900 mt-1">
            They'll be skipped — no email, no account creation. The lease still imports for the matched co-tenants.
            Common cause: applicants who paid a security deposit but never moved in.
          </p>
        </div>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1 mb-5">
        {joinedLeases.map((lease, i) => {
          const fatal = lease.errors.some((e) => /Missing/i.test(e))
          return (
            <div
              key={i}
              className={`rounded-lg border px-3 py-2.5 text-xs ${
                fatal ? 'bg-red-50 border-red-200' :
                lease.errors.length > 0 ? 'bg-amber-50 border-amber-200' :
                'bg-emerald-50 border-emerald-200'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold text-ink truncate">
                  {lease.property_address} {lease.unit_number ? `· Unit ${lease.unit_number}` : ''}
                </p>
                <span className="text-[10px] uppercase tracking-wider font-bold text-mute">
                  {lease.tenants.length} tenant{lease.tenants.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-mute mt-0.5">
                ${lease.rent_amount?.toLocaleString() ?? '—'}/mo · {lease.lease_start ?? '?'} → {lease.lease_end ?? '?'}
              </p>
              <p className="text-mute mt-1">
                {lease.tenants.map((t, ti) => (
                  <span key={ti} className={t.matched ? 'text-ink' : 'text-amber-700 line-through'}>
                    {t.matched ? `${t.first_name} ${t.last_name}` : t.last_name}
                    {ti < lease.tenants.length - 1 && ', '}
                  </span>
                ))}
              </p>
              {lease.errors.length > 0 && (
                <p className={`mt-1 text-[11px] ${fatal ? 'text-red-900' : 'text-amber-900'}`}>{lease.errors.join('; ')}</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="bg-brand-50/60 border border-brand-200 rounded-xl p-4 text-sm text-ink mb-5">
        <p className="font-semibold inline-flex items-center gap-2"><Sparkles className="w-4 h-4 text-brand-600" />When you click Import</p>
        <ul className="list-disc pl-5 mt-2 text-xs text-mute leading-relaxed space-y-1">
          <li>Properties + units appear in your dashboard</li>
          <li>Every matched tenant gets a "your landlord moved to FindStoop" email</li>
          {statusCounts.active > 0 && <li><strong>{statusCounts.active} Active</strong> — signed PDF, current term — go live immediately</li>}
          {statusCounts.active_m2m > 0 && <li><strong>{statusCounts.active_m2m} Month-to-month</strong> — term ended but tenant is still there — also go live immediately</li>}
          {statusCounts.upcoming > 0 && <li><strong>{statusCounts.upcoming} Upcoming</strong> — signed, future start — wait until move-in to bill</li>}
          {statusCounts.pending > 0 && <li><strong>{statusCounts.pending} Pending</strong> — no signed PDF — generate a FindStoop lease before activating</li>}
          <li>Co-tenants on the same lease share one lease record</li>
          {stripeBumpCount > 0 && <li className="text-amber-800"><strong>Heads up:</strong> {stripeBumpCount} lease{stripeBumpCount === 1 ? '' : 's'} will count toward your Stripe subscription right away</li>}
        </ul>
      </div>

      {leasesWithErrors > 0 && (
        <p className="text-xs text-mute mb-4">
          {leasesWithErrors} lease{leasesWithErrors === 1 ? '' : 's'} flagged with warnings.
          Rows missing required fields will be skipped automatically.
        </p>
      )}

      <div className="flex items-center justify-between">
        <button type="button" disabled={submitting} onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || validLeaseCount === 0}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-lg"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" strokeWidth={2} />}
          {submitting ? 'Importing…' : `Import ${validLeaseCount} lease${validLeaseCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </section>
  )
}

// ── Done step ──────────────────────────────────────────────────────────────
function DoneStep({ result, onOpenLeases, onDashboard }: {
  result: ImportResult
  onOpenLeases: () => void
  onDashboard: () => void
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
      <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-600 mb-3" strokeWidth={1.5} />
      <h2 className="text-2xl font-bold text-ink">Portfolio imported.</h2>
      <p className="text-sm text-mute mt-2 max-w-md mx-auto">
        Tenants are getting their migration emails now. Leases with existing signed PDFs are already <strong>Active</strong>; the rest stay <strong>Pending</strong> until you generate a FindStoop agreement.
      </p>
      <div className="grid sm:grid-cols-4 gap-3 mt-6">
        <DoneStat label="Properties"        value={result.counts.properties_created} />
        <DoneStat label="Units"             value={result.counts.units_created} />
        <DoneStat label="Tenants emailed"   value={result.counts.tenants_invited + result.counts.tenants_linked} />
        <DoneStat label={`Leases (${(result.counts.leases_activated ?? 0)} active)`} value={result.counts.leases_created} />
      </div>
      {result.errors.length > 0 && (
        <details className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
          <summary className="cursor-pointer text-sm font-semibold text-amber-900">
            {result.errors.length} row{result.errors.length === 1 ? '' : 's'} flagged — review
          </summary>
          <ul className="mt-3 text-xs text-amber-900 space-y-1">
            {result.errors.slice(0, 50).map((e, i) => (
              <li key={i}><strong>{e.scope} #{e.index + 1}:</strong> {e.message}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={onOpenLeases} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium px-5 py-2.5 rounded-lg">
          Open Leases
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </button>
        <button type="button" onClick={onDashboard} className="inline-flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-ink font-medium px-5 py-2.5 rounded-lg">
          Dashboard
        </button>
      </div>
    </section>
  )
}

// ── Tiny helpers ──────────────────────────────────────────────────────────
function SummaryCard({ Icon, label, value, sub }: { Icon: LucideIcon; label: string; value: number; sub?: string }) {
  return (
    <div className="bg-gray-50/70 border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wider text-mute font-bold">{label}</p>
        <Icon className="w-4 h-4 text-mute" strokeWidth={1.75} />
      </div>
      <p className="text-2xl font-bold text-ink">{value}</p>
      {sub && <p className="text-[10px] text-mute mt-0.5">{sub}</p>}
    </div>
  )
}

function DoneStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
      <p className="text-3xl font-bold text-emerald-700">{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-emerald-700/80 font-bold mt-1">{label}</p>
    </div>
  )
}

function countUniqueUnits(leases: JoinedLease[]): number {
  const set = new Set<string>()
  for (const l of leases) set.add(`${normAddress(l.property_address)}|${l.unit_number.toLowerCase()}`)
  return set.size
}
