// Lease addendum (landlord ⇄ all tenants).
//
// A manager-authored amendment to an executed lease. Renders inside the shared
// Letterhead using the same DocumentContext + .doc-* styling. The actual
// agreement is captured by in-house e-signatures from every party (stored in
// generated_document_signatures); this is the body they sign.

import { type DocumentContext, type TemplateField, esc, longDate, paragraphs } from './helpers'

export const ADDENDUM_FIELDS: TemplateField[] = [
  { key: 'title', label: 'Addendum title', type: 'text', required: true, help: 'e.g. Rent Adjustment Addendum, Pet Addendum.' },
  { key: 'effective_date', label: 'Effective date', type: 'date', required: true },
  { key: 'body', label: 'What is changing', type: 'textarea', required: true, help: 'Describe the amendment in plain terms — the exact change to the lease.' },
]

export function renderAddendumLetter(ctx: DocumentContext): string {
  const addr = [esc(ctx.property_address), ctx.unit_label ? `Unit ${esc(ctx.unit_label)}` : '']
    .filter(Boolean).join(', ')
  const landlord = String(ctx.f.landlord_entity || ctx.landlord_entity || ctx.landlord_name || 'Landlord')
  const tenants = String(ctx.f.tenant_names || ctx.tenant_name || 'Tenant(s)')
  const term = ctx.lease_start && ctx.lease_end
    ? `${longDate(ctx.lease_start)} – ${longDate(ctx.lease_end)}`
    : '—'
  return `
    <p class="doc-date">${longDate(ctx.today)}</p>
    <h1 class="doc-title">${esc(ctx.f.title || 'Lease Addendum')}</h1>
    <p class="doc-to">
      <strong>This addendum amends the lease for:</strong> ${addr}, ${esc(ctx.city)}, ${esc(ctx.state)} ${esc(ctx.zip)}<br/>
      <strong>Landlord:</strong> ${esc(landlord)}<br/>
      <strong>Tenant(s):</strong> ${esc(tenants)}<br/>
      <strong>Original lease term:</strong> ${term}<br/>
      <strong>Effective date of this addendum:</strong> ${longDate(ctx.f.effective_date as string)}
    </p>
    <div class="doc-body">
      <p>The landlord and tenant(s) named above agree to amend the existing lease for the property above as follows:</p>
      ${paragraphs(ctx.f.body)}
      <p>All other terms and conditions of the original lease remain in full force and effect. Once signed by every party below, this addendum becomes part of that lease.</p>
    </div>
    <p class="doc-signoff">Agreed and accepted by all parties, signed electronically:</p>
    <p class="doc-sign-name"><strong>${esc(landlord)}</strong> (Landlord) &nbsp;·&nbsp; ${esc(tenants)} (Tenant${tenants.includes(',') ? 's' : ''})</p>
  `
}
