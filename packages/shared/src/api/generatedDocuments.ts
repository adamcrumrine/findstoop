import { supabase } from '../lib/supabase'
import type {
  GeneratedDocument,
  GeneratedDocumentEvent,
  DocEvent,
  DocType,
  DeliveryMethod,
  LatePaymentSeries,
  LateSeriesStep,
} from '../types/generatedDocument'
import type { DocumentContext, TemplateField } from '../lib/documentTemplates'

// Half of a document's merge data that comes from existing records (the other
// half is the manager-entered field values). The builder looks this up once a
// lease is chosen, then prefills the form from it.
export interface DocContextSource {
  landlord_name: string
  landlord_entity: string
  landlord_email: string | null
  landlord_phone: string | null
  tenant_name: string
  tenant_email: string | null
  property_address: string
  unit_label: string | null
  city: string
  state: string
  zip: string
  rent_amount: number
  security_deposit: number | null
  lease_start: string | null
  lease_end: string | null
  overdue_amount: number | null
  overdue_due_date: string | null
}

export interface LeaseDocBundle {
  lease_id: string
  unit_id: string | null
  property_id: string
  tenant_id: string | null
  state: string
  source: DocContextSource
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const addDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Collect: prefill from existing data, never ask for what we can look up ──

export async function getLeaseDocContext(leaseId: string): Promise<LeaseDocBundle | null> {
  const { data: lease, error } = await supabase
    .from('leases')
    .select(`
      *,
      tenant:profiles!leases_tenant_id_fkey(*),
      unit:units(*, property:properties(*))
    `)
    .eq('id', leaseId)
    .single()
  if (error || !lease) return null

  const property = (lease as any).unit?.property
  const unit = (lease as any).unit
  const tenant = (lease as any).tenant
  const managerId: string | null = property?.manager_id ?? null

  let manager: any = null
  if (managerId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', managerId).maybeSingle()
    manager = data
  }

  // Latest overdue, still-pending rent payment (for late-notice prefill).
  let overdue_amount: number | null = null
  let overdue_due_date: string | null = null
  const { data: overdue } = await supabase
    .from('payments')
    .select('amount, due_date')
    .eq('lease_id', leaseId)
    .eq('type', 'rent')
    .eq('status', 'pending')
    .lt('due_date', todayIso())
    .order('due_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (overdue) {
    overdue_amount = Number(overdue.amount)
    overdue_due_date = overdue.due_date
  }

  const source: DocContextSource = {
    landlord_name: manager?.full_name ?? 'Landlord',
    landlord_entity: manager?.company_name?.trim() || manager?.full_name || 'Landlord',
    landlord_email: manager?.email ?? null,
    landlord_phone: manager?.phone ?? null,
    tenant_name: tenant?.full_name ?? tenant?.email ?? 'Tenant',
    tenant_email: tenant?.email ?? null,
    property_address: property?.address ?? '',
    unit_label: unit?.unit_number ?? null,
    city: property?.city ?? '',
    state: property?.state ?? '',
    zip: property?.zip ?? '',
    rent_amount: Number(lease.rent_amount ?? unit?.rent_amount ?? 0),
    security_deposit: lease.security_deposit != null ? Number(lease.security_deposit) : null,
    lease_start: lease.start_date ?? null,
    lease_end: lease.end_date ?? null,
    overdue_amount,
    overdue_due_date,
  }

  return {
    lease_id: lease.id,
    unit_id: lease.unit_id ?? null,
    property_id: property?.id,
    tenant_id: lease.tenant_id ?? null,
    state: property?.state ?? '',
    source,
  }
}

// Resolve a field's prefill value from looked-up data. Returned as a string so
// it can seed a form input directly.
export function resolvePrefill(
  prefill: TemplateField['prefill'],
  source: DocContextSource,
): string {
  switch (prefill) {
    case 'current_rent': return String(source.rent_amount ?? '')
    case 'security_deposit': return source.security_deposit != null ? String(source.security_deposit) : ''
    case 'today': return todayIso()
    case 'lease_end': return source.lease_end ?? ''
    case 'day_after_lease_end': return source.lease_end ? addDays(source.lease_end, 1) : ''
    case 'overdue_amount': return source.overdue_amount != null ? String(source.overdue_amount) : ''
    case 'overdue_due_date': return source.overdue_due_date ?? ''
    default: return ''
  }
}

// Combine looked-up source + manager-entered fields into the render context.
export function buildDocumentContext(
  source: DocContextSource,
  fieldValues: Record<string, string | number | null>,
): DocumentContext {
  return {
    landlord_name: source.landlord_name,
    landlord_entity: source.landlord_entity,
    landlord_email: source.landlord_email,
    landlord_phone: source.landlord_phone,
    tenant_name: source.tenant_name,
    tenant_email: source.tenant_email,
    property_address: source.property_address,
    unit_label: source.unit_label,
    city: source.city,
    state: source.state,
    zip: source.zip,
    rent_amount: source.rent_amount,
    security_deposit: source.security_deposit,
    lease_start: source.lease_start,
    lease_end: source.lease_end,
    today: todayIso(),
    f: fieldValues,
  }
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export interface CreateDraftInput {
  property_id: string
  unit_id: string | null
  lease_id: string | null
  tenant_id: string | null
  type: DocType
  template_key: string
  template_version: string
  title: string
  field_values: Record<string, string | number | null>
  generated_body: string
  requires_signature: boolean
  created_by: string
  meta?: Record<string, unknown>
}

export async function createDraft(input: CreateDraftInput): Promise<GeneratedDocument> {
  const { data, error } = await supabase
    .from('generated_documents')
    .insert({ ...input, status: 'draft', meta: input.meta ?? {} })
    .select()
    .single()
  if (error) throw new Error(error.message)
  await logEvent(data.id, 'created', input.created_by)
  return data as GeneratedDocument
}

export async function updateDraft(
  id: string,
  patch: Partial<Pick<GeneratedDocument, 'title' | 'field_values' | 'generated_body' | 'requires_signature'>>,
  actorId: string,
): Promise<GeneratedDocument> {
  const { data, error } = await supabase
    .from('generated_documents')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  await logEvent(id, 'edited', actorId)
  return data as GeneratedDocument
}

export async function getGeneratedDocument(id: string): Promise<GeneratedDocument | null> {
  const { data, error } = await supabase.from('generated_documents').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as GeneratedDocument) ?? null
}

export async function listGeneratedDocuments(propertyIds: string[]): Promise<GeneratedDocument[]> {
  if (propertyIds.length === 0) return []
  const { data, error } = await supabase
    .from('generated_documents')
    .select('*')
    .in('property_id', propertyIds)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as GeneratedDocument[]
}

export async function markReviewed(id: string, actorId: string): Promise<void> {
  const { error } = await supabase
    .from('generated_documents')
    .update({ status: 'pending_review' })
    .eq('id', id)
    .eq('status', 'draft')
  if (error) throw new Error(error.message)
  await logEvent(id, 'reviewed', actorId)
}

export async function markSent(id: string, method: DeliveryMethod, actorId: string): Promise<void> {
  const { error } = await supabase
    .from('generated_documents')
    .update({ status: 'sent', delivery_method: method, sent_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  await logEvent(id, 'sent', actorId, { method })
}

export async function voidDocument(id: string, actorId: string): Promise<void> {
  const { error } = await supabase
    .from('generated_documents')
    .update({ status: 'voided', voided_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  await logEvent(id, 'voided', actorId)
}

// ── Tenant-facing view bundle ──────────────────────────────────────────────

export interface DocViewBundle {
  doc: GeneratedDocument
  propertyName: string
  propertyAddress: string
  managerName: string
  managerEmail: string | null
}

export async function getDocumentForView(id: string): Promise<DocViewBundle | null> {
  const doc = await getGeneratedDocument(id)
  if (!doc) return null
  let propertyName = ''
  let propertyAddress = ''
  let managerName = 'Your landlord'
  let managerEmail: string | null = null
  const { data: p } = await supabase
    .from('properties')
    .select('name, address, city, state, zip, manager_id')
    .eq('id', doc.property_id)
    .maybeSingle()
  if (p) {
    propertyName = p.name ?? p.address ?? ''
    propertyAddress = [p.address, `${p.city}, ${p.state} ${p.zip}`].filter(Boolean).join(', ')
    if (p.manager_id) {
      const { data: m } = await supabase
        .from('profiles')
        .select('full_name, company_name, email')
        .eq('id', p.manager_id)
        .maybeSingle()
      if (m) {
        managerName = m.company_name?.trim() || m.full_name || 'Your landlord'
        managerEmail = m.email ?? null
      }
    }
  }
  return { doc, propertyName, propertyAddress, managerName, managerEmail }
}

// Send the document to a tenant (email or e-sign) via the edge function, which
// stamps sent_at + logs the audit event server-side. `recipientId` overrides
// the default addressee (doc.tenant_id) — used to notify each co-signer of an
// addendum individually.
export async function sendDocumentReady(documentId: string, recipientId?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('notify-tenant-document-ready', {
    body: { documentId, recipientId },
  })
  if (error) throw new Error(error.message)
  if (data && (data as any).error) throw new Error((data as any).error)
}

// ── Lease addenda (amend an executed lease, signed by all parties) ──────────

export interface LeaseSigner {
  id: string
  name: string
  email: string | null
  role: 'manager' | 'tenant'
}

// The landlord + every primary tenant on a lease — the parties who must sign an
// addendum. Falls back to leases.tenant_id when a lease has no lease_tenants rows.
export async function getLeaseSigners(leaseId: string): Promise<{ manager: LeaseSigner | null; primaries: LeaseSigner[] }> {
  const { data: lt } = await supabase
    .from('lease_tenants')
    .select('is_primary, profile:profiles!lease_tenants_tenant_id_fkey(id, full_name, email)')
    .eq('lease_id', leaseId)
    .eq('is_primary', true)
  let primaries: LeaseSigner[] = ((lt ?? []) as any[])
    .filter((r) => r.profile)
    .map((r) => ({ id: r.profile.id, name: r.profile.full_name ?? r.profile.email ?? 'Tenant', email: r.profile.email ?? null, role: 'tenant' as const }))

  const { data: lease } = await supabase
    .from('leases')
    .select('tenant_id, tenant:profiles!leases_tenant_id_fkey(id, full_name, email), unit:units(property:properties(manager_id))')
    .eq('id', leaseId)
    .single()

  if (primaries.length === 0 && (lease as any)?.tenant) {
    const t = (lease as any).tenant
    primaries = [{ id: t.id, name: t.full_name ?? t.email ?? 'Tenant', email: t.email ?? null, role: 'tenant' }]
  }

  const managerId = (lease as any)?.unit?.property?.manager_id ?? null
  let manager: LeaseSigner | null = null
  if (managerId) {
    const { data: m } = await supabase.from('profiles').select('id, full_name, company_name, email').eq('id', managerId).maybeSingle()
    if (m) manager = { id: m.id, name: (m.company_name?.trim() || m.full_name) ?? 'Landlord', email: m.email ?? null, role: 'manager' }
  }
  return { manager, primaries }
}

export interface DocSignatureRow { signer_id: string; signer_role: string; signed_at: string }

export async function getDocumentSignatures(documentId: string): Promise<DocSignatureRow[]> {
  const { data, error } = await supabase
    .from('generated_document_signatures')
    .select('signer_id, signer_role, signed_at')
    .eq('document_id', documentId)
  if (error) throw new Error(error.message)
  return (data ?? []) as DocSignatureRow[]
}

// Insert the calling user's signature on a document. RLS lets the manager sign
// their own property's docs and any lease party sign an addendum.
export async function recordDocumentSignature(
  documentId: string,
  signerId: string,
  role: 'manager' | 'tenant',
  signatureData: string,
): Promise<void> {
  const { error } = await supabase.from('generated_document_signatures').insert({
    document_id: documentId,
    signer_id: signerId,
    signer_role: role,
    signature_data: signatureData,
    intent_acknowledged: true,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  })
  if (error) throw new Error(error.message)
}

export interface CreateAddendumInput {
  bundle: LeaseDocBundle
  title: string
  effectiveDate: string
  body: string
  generatedBody: string      // pre-rendered HTML (renderAddendumLetter)
  manager: LeaseSigner
  managerSignatureData: string
  primaries: LeaseSigner[]
}

// Create an addendum, capture the landlord's signature, and email each primary
// tenant a link to sign. It finalizes (status='signed') only once everyone has
// signed (the multi-party finalize trigger).
export async function createAddendum(input: CreateAddendumInput): Promise<GeneratedDocument> {
  const requiredIds = [input.manager.id, ...input.primaries.map((p) => p.id)]
  const doc = await createDraft({
    property_id: input.bundle.property_id,
    unit_id: input.bundle.unit_id,
    lease_id: input.bundle.lease_id,
    tenant_id: input.primaries[0]?.id ?? input.bundle.tenant_id,
    type: 'addendum',
    template_key: 'addendum',
    template_version: '1',
    title: input.title,
    field_values: { title: input.title, effective_date: input.effectiveDate, body: input.body },
    generated_body: input.generatedBody,
    requires_signature: true,
    created_by: input.manager.id,
    meta: {
      required_signer_ids: requiredIds,
      effective_date: input.effectiveDate,
      signer_names: input.primaries.map((p) => p.name),
    },
  })
  await recordDocumentSignature(doc.id, input.manager.id, 'manager', input.managerSignatureData)
  await markSent(doc.id, 'esign', input.manager.id)
  for (const p of input.primaries) {
    try { await sendDocumentReady(doc.id, p.id) } catch { /* email failure surfaced by caller via retry */ }
  }
  return doc
}

// ── Audit ─────────────────────────────────────────────────────────────────

export async function logEvent(
  documentId: string,
  event: DocEvent,
  actorId: string | null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase
    .from('generated_document_events')
    .insert({ document_id: documentId, actor_id: actorId, event, meta })
  if (error) throw new Error(error.message)
}

export async function getDocumentEvents(documentId: string): Promise<GeneratedDocumentEvent[]> {
  const { data, error } = await supabase
    .from('generated_document_events')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as GeneratedDocumentEvent[]
}

// ── Late-payment series (used by the Payments banner in M3) ─────────────────

export async function getSeriesForLeases(leaseIds: string[]): Promise<Record<string, LatePaymentSeries>> {
  if (leaseIds.length === 0) return {}
  const { data, error } = await supabase.from('late_payment_series').select('*').in('lease_id', leaseIds)
  if (error) throw new Error(error.message)
  const map: Record<string, LatePaymentSeries> = {}
  ;(data ?? []).forEach((r) => { map[(r as LatePaymentSeries).lease_id] = r as LatePaymentSeries })
  return map
}

export async function listGeneratedDocumentsForLease(leaseId: string): Promise<GeneratedDocument[]> {
  const { data, error } = await supabase
    .from('generated_documents')
    .select('*')
    .eq('lease_id', leaseId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as GeneratedDocument[]
}

export async function getSeries(leaseId: string): Promise<LatePaymentSeries | null> {
  const { data, error } = await supabase
    .from('late_payment_series')
    .select('*')
    .eq('lease_id', leaseId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as LatePaymentSeries) ?? null
}

export async function upsertSeries(
  leaseId: string,
  patch: Partial<Omit<LatePaymentSeries, 'lease_id' | 'updated_at'>>,
): Promise<LatePaymentSeries> {
  const { data, error } = await supabase
    .from('late_payment_series')
    .upsert({ lease_id: leaseId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'lease_id' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as LatePaymentSeries
}

const SERIES_NEXT: Record<LateSeriesStep, LateSeriesStep> = {
  day5: 'day10', day10: 'day15', day15: 'done', done: 'done',
}

// Record that a series step's document was sent and advance the pointer.
export async function advanceSeries(leaseId: string, step: LateSeriesStep, docId: string): Promise<void> {
  const col = step === 'day5' ? 'day5_doc_id' : step === 'day10' ? 'day10_doc_id' : 'day15_doc_id'
  await upsertSeries(leaseId, {
    [col]: docId,
    next_step: SERIES_NEXT[step],
    next_eligible_on: new Date().toISOString().slice(0, 10),
  } as Partial<LatePaymentSeries>)
}
