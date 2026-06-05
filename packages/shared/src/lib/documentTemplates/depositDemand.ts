// Tenant-authored security-deposit demand letter (tenant → landlord).
//
// Standalone from the manager document registry (it's tenant-side), but reuses
// the same DocumentContext + helpers + .doc-* styling so it renders inside the
// shared Letterhead. Ohio-grounded (ORC 5321.16). Not legal advice — the
// Letterhead carries the disclaimer.

import { type DocumentContext, type TemplateField, esc, money, longDate, paragraphs } from './helpers'

export const DEPOSIT_DEMAND_FIELDS: TemplateField[] = [
  { key: 'landlord_name', label: "Landlord / company name", type: 'text', required: true, help: 'Who you address the letter to.' },
  { key: 'move_out_date', label: 'Date you moved out', type: 'date', required: true, prefill: 'lease_end' },
  { key: 'forwarding_address', label: 'Your forwarding address', type: 'textarea', required: true, help: 'Where the landlord should mail your deposit.' },
  { key: 'deposit_amount', label: 'Security deposit you paid', type: 'number', required: true, prefill: 'security_deposit' },
  { key: 'amount_owed', label: 'Amount you believe you are owed', type: 'number', required: true },
  { key: 'disputed', label: 'Deductions you dispute (optional)', type: 'textarea', help: 'One per line — what they charged and why it’s wrong (e.g. normal wear and tear).' },
  { key: 'respond_by', label: 'Respond by', type: 'date', required: true, help: 'A reasonable deadline — e.g. 10 days out.' },
]

export function renderDepositDemandLetter(ctx: DocumentContext): string {
  const addr = [esc(ctx.property_address), ctx.unit_label ? `Unit ${esc(ctx.unit_label)}` : '']
    .filter(Boolean).join(', ')
  const landlord = String(ctx.f.landlord_name || ctx.landlord_name || 'Landlord')
  return `
    <p class="doc-date">${longDate(ctx.today)}</p>
    <h1 class="doc-title">Demand for Return of Security Deposit</h1>
    <p class="doc-to">
      <strong>To:</strong> ${esc(landlord)}<br/>
      <strong>From:</strong> ${esc(ctx.tenant_name)}${ctx.tenant_email ? ` (${esc(ctx.tenant_email)})` : ''}<br/>
      <strong>Re:</strong> ${addr}, ${esc(ctx.city)}, ${esc(ctx.state)} ${esc(ctx.zip)}
    </p>
    <div class="doc-body">
      <p>I was a tenant at the address above. My tenancy ended on <strong>${longDate(ctx.f.move_out_date as string)}</strong>, and I am providing my forwarding address for the return of my security deposit:</p>
      ${paragraphs(ctx.f.forwarding_address)}
      <table class="doc-terms">
        <tr><th>Security deposit paid</th><td>${money(ctx.f.deposit_amount)}</td></tr>
        <tr class="doc-total"><th>Amount I am owed</th><td>${money(ctx.f.amount_owed)}</td></tr>
      </table>
      <p>Under <strong>Ohio Revised Code § 5321.16</strong>, a landlord must return the security deposit — minus any <em>itemized</em> deductions for unpaid rent or actual damages — within <strong>30 days</strong> of the end of the tenancy, once given a forwarding address. Ordinary wear and tear may not be deducted.</p>
      ${ctx.f.disputed ? `<h2 class="doc-h2">Deductions I dispute</h2>${paragraphs(ctx.f.disputed)}` : ''}
      <p>Please return <strong>${money(ctx.f.amount_owed)}</strong> to my forwarding address by <strong>${longDate(ctx.f.respond_by as string)}</strong>. If a deposit is wrongfully withheld, Ohio law (ORC 5321.16) allows a tenant to recover <strong>twice the amount wrongfully withheld plus reasonable attorney’s fees</strong>.</p>
      <p>Thank you for your prompt attention to this matter.</p>
    </div>
    <p class="doc-signoff">Sincerely,</p>
    <p class="doc-sign-name"><strong>${esc(ctx.tenant_name)}</strong></p>
  `
}
