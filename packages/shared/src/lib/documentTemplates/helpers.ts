// Document-template engine — shared contract + HTML helpers.
//
// Templates are versioned TypeScript modules (same idea as leaseTemplates.ts),
// not Handlebars files. Each render() returns the *inner* HTML of the letter;
// the Letterhead component wraps it with brand header, EHO mark, and the
// "not legal advice" disclaimer, so templates stay focused on the body.

import { formatUsdCents, formatLocalDate } from '../format'
import type { DocType } from '../../types/generatedDocument'

// Merge data handed to a template's render(). Lease/property facts are looked
// up from existing data; `f` holds the manager-entered fields the app can't
// know (new rent, dates, reasons, etc.).
export interface DocumentContext {
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
  today: string // YYYY-MM-DD
  f: Record<string, string | number | null>
}

export type FieldType = 'text' | 'number' | 'date' | 'textarea' | 'select'

export interface TemplateField {
  key: string
  label: string
  type: FieldType
  required?: boolean
  help?: string
  options?: Array<{ value: string; label: string }>
  // When set, the builder prefills this field from looked-up data and tags it
  // "auto-filled" so the manager sees what came from their records.
  prefill?: 'current_rent' | 'security_deposit' | 'today' | 'lease_end' | 'day_after_lease_end' | 'overdue_amount' | 'overdue_due_date'
}

export interface TemplateDef {
  type: DocType
  state: string
  version: string
  label: string
  description: string
  requiresSignature: boolean
  // 'email_or_esign' forces a delivery record (used for Day-15 Pay or Quit).
  deliveryRule: 'any' | 'email_or_esign'
  fields: TemplateField[]
  render: (ctx: DocumentContext) => string
}

// ── HTML helpers ───────────────────────────────────────────────────────────

export function esc(value: unknown): string {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function money(value: number | string | null | undefined): string {
  if (value == null || value === '') return '$0.00'
  return formatUsdCents(Number(value))
}

export function longDate(value: string | null | undefined): string {
  if (!value) return '__________'
  const s = String(value)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s)
  if (Number.isNaN(d.getTime())) return formatLocalDate(s)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// Re-render a manager free-text field as paragraphs, escaping HTML.
export function paragraphs(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${esc(para).replace(/\n/g, '<br/>')}</p>`)
    .join('\n')
}

// Standard heading + greeting + signoff shared across letters.
export function letterHeading(ctx: DocumentContext, heading: string): string {
  const addressLine = [
    esc(ctx.property_address),
    ctx.unit_label ? `Unit ${esc(ctx.unit_label)}` : '',
  ].filter(Boolean).join(', ')
  return `
    <p class="doc-date">${longDate(ctx.today)}</p>
    <h1 class="doc-title">${esc(heading)}</h1>
    <p class="doc-to">
      <strong>To:</strong> ${esc(ctx.tenant_name)}<br/>
      <strong>Re:</strong> ${addressLine}, ${esc(ctx.city)}, ${esc(ctx.state)} ${esc(ctx.zip)}
    </p>
  `
}

export function letterSignoff(ctx: DocumentContext): string {
  const contact = [ctx.landlord_email, ctx.landlord_phone].filter(Boolean).map(esc).join(' · ')
  return `
    <p class="doc-signoff">Sincerely,</p>
    <p class="doc-sign-name">
      <strong>${esc(ctx.landlord_entity || ctx.landlord_name)}</strong><br/>
      ${esc(ctx.landlord_name)}${contact ? `<br/><span class="doc-contact">${contact}</span>` : ''}
    </p>
  `
}
