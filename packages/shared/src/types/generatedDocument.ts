// Types for Document Automation ("Letters & Notices").
//
// Distinct from `documents` (file uploads). A generated document stores its
// rendered HTML body as the source of truth; the print route re-renders it.

export type DocStatus = 'draft' | 'pending_review' | 'sent' | 'signed' | 'voided'

export type DeliveryMethod = 'download' | 'email' | 'esign'

// Generated document types. `late_payment` is presented to the manager as a
// single catalog card but resolves to one of the three escalation steps.
export type DocType =
  | 'lease_renewal'
  | 'rent_increase'
  | 'late_payment_d5'
  | 'late_payment_d10'
  | 'late_payment_d15'
  | 'move_out'
  | 'security_deposit'
  | 'maintenance_ack'
  | 'lease_violation'
  | 'entry_notice'
  | 'addendum'

export type DocEvent =
  | 'created'
  | 'reviewed'
  | 'edited'
  | 'sent'
  | 'opened'
  | 'signed'
  | 'voided'

export interface GeneratedDocument {
  id: string
  property_id: string
  unit_id: string | null
  lease_id: string | null
  tenant_id: string | null
  type: DocType
  template_key: string
  template_version: string
  status: DocStatus
  title: string
  field_values: Record<string, string | number | null>
  generated_body: string | null
  pdf_url: string | null
  delivery_method: DeliveryMethod | null
  requires_signature: boolean
  sent_at: string | null
  signed_at: string | null
  voided_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  meta: Record<string, unknown>
}

export interface GeneratedDocumentEvent {
  id: string
  document_id: string
  actor_id: string | null
  event: DocEvent
  meta: Record<string, unknown>
  created_at: string
}

export type LateSeriesStep = 'day5' | 'day10' | 'day15' | 'done'

export interface LatePaymentSeries {
  lease_id: string
  day5_doc_id: string | null
  day10_doc_id: string | null
  day15_doc_id: string | null
  next_step: LateSeriesStep
  next_eligible_on: string | null
  updated_at: string
}
