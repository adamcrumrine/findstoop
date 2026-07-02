// Ohio (OH) document templates.
//
// Original FindStoop wording. Statutory references (ORC sections, statutory
// notice periods) are stated as facts, not as legal advice — the Letterhead
// disclaimer makes clear FindStoop doesn't provide legal advice.

import {
  type TemplateDef,
  type DocumentContext,
  esc, money, longDate, paragraphs, letterHeading, letterSignoff,
} from './helpers'

const wrap = (ctx: DocumentContext, heading: string, body: string): string =>
  `${letterHeading(ctx, heading)}\n<div class="doc-body">\n${body}\n</div>\n${letterSignoff(ctx)}`

// ── Lease Renewal Notice ────────────────────────────────────────────────────

const leaseRenewal: TemplateDef = {
  type: 'lease_renewal',
  state: 'OH',
  version: '1.0.0',
  label: 'Lease Renewal Notice',
  description: 'Offer the tenant a new term before the current lease ends.',
  requiresSignature: false,
  deliveryRule: 'any',
  fields: [
    { key: 'new_start_date', label: 'New term starts', type: 'date', required: true, prefill: 'day_after_lease_end' },
    { key: 'new_term', label: 'New term length', type: 'select', required: true, options: [
      { value: '12 months', label: '12 months' },
      { value: '6 months', label: '6 months' },
      { value: 'month-to-month', label: 'Month-to-month' },
    ] },
    { key: 'new_rent', label: 'Monthly rent for the new term', type: 'number', required: true, prefill: 'current_rent' },
    { key: 'respond_by', label: 'Please respond by', type: 'date', required: true },
  ],
  render: (ctx) => wrap(ctx, 'Lease Renewal Offer', `
    <p>Your current lease ends on <strong>${longDate(ctx.lease_end)}</strong>. We'd like to have you stay, so here's an offer to renew.</p>
    <table class="doc-terms">
      <tr><th>New term begins</th><td>${longDate(ctx.f.new_start_date as string)}</td></tr>
      <tr><th>Term length</th><td>${esc(ctx.f.new_term)}</td></tr>
      <tr><th>Monthly rent</th><td>${money(ctx.f.new_rent)}</td></tr>
    </table>
    <p>If these terms work for you, let us know by <strong>${longDate(ctx.f.respond_by as string)}</strong> and we'll send the new lease to sign. If anything's changed on your end, reply and we'll talk it through.</p>
    <p>Thanks for being a great tenant.</p>
  `),
}

// ── Rent Increase Notice ────────────────────────────────────────────────────

const rentIncrease: TemplateDef = {
  type: 'rent_increase',
  state: 'OH',
  version: '1.0.0',
  label: 'Rent Increase Notice',
  description: 'Tell the tenant about a change in monthly rent and when it starts.',
  requiresSignature: false,
  deliveryRule: 'any',
  fields: [
    { key: 'new_rent', label: 'New monthly rent', type: 'number', required: true },
    { key: 'effective_date', label: 'New rent starts on', type: 'date', required: true },
    { key: 'reason', label: 'Reason (optional)', type: 'textarea', help: 'Plain-language context, e.g. rising property taxes. Leave blank to skip.' },
  ],
  render: (ctx) => wrap(ctx, 'Notice of Rent Increase', `
    <p>This is a notice that the monthly rent for your home is changing.</p>
    <table class="doc-terms">
      <tr><th>Current rent</th><td>${money(ctx.rent_amount)}</td></tr>
      <tr><th>New rent</th><td>${money(ctx.f.new_rent)}</td></tr>
      <tr><th>Starts on</th><td>${longDate(ctx.f.effective_date as string)}</td></tr>
    </table>
    ${ctx.f.reason ? `<p><strong>Why:</strong></p>${paragraphs(ctx.f.reason)}` : ''}
    <p>Everything else in your lease stays the same. If you have questions, just reach out — happy to talk it through.</p>
  `),
}

// ── Late Payment Series — Day 5 (friendly reminder) ─────────────────────────

const latePaymentD5: TemplateDef = {
  type: 'late_payment_d5',
  state: 'OH',
  version: '1.0.0',
  label: 'Late Rent — Friendly Reminder',
  description: 'A gentle nudge when rent is about 5 days past due.',
  requiresSignature: false,
  deliveryRule: 'any',
  fields: [
    { key: 'amount_due', label: 'Amount past due', type: 'number', required: true, prefill: 'overdue_amount' },
    { key: 'due_date', label: 'Rent was due on', type: 'date', required: true, prefill: 'overdue_due_date' },
  ],
  render: (ctx) => wrap(ctx, 'Friendly Rent Reminder', `
    <p>Just a quick heads-up — we haven't received this month's rent yet. It's easy to lose track, so no worries if it slipped your mind.</p>
    <table class="doc-terms">
      <tr><th>Amount due</th><td>${money(ctx.f.amount_due)}</td></tr>
      <tr><th>Was due</th><td>${longDate(ctx.f.due_date as string)}</td></tr>
    </table>
    <p>If you can take care of it in the next few days, that'd be great. Already sent it? Then please ignore this note. If something's come up, reach out and let's figure it out together.</p>
  `),
}

// ── Late Payment Series — Day 10 (formal notice) ────────────────────────────

const latePaymentD10: TemplateDef = {
  type: 'late_payment_d10',
  state: 'OH',
  version: '1.0.0',
  label: 'Late Rent — Formal Notice',
  description: 'A firmer, on-the-record notice with the late fee included.',
  requiresSignature: false,
  deliveryRule: 'any',
  fields: [
    { key: 'amount_due', label: 'Rent past due', type: 'number', required: true, prefill: 'overdue_amount' },
    { key: 'late_fee', label: 'Late fee', type: 'number', required: false },
    { key: 'due_date', label: 'Rent was due on', type: 'date', required: true, prefill: 'overdue_due_date' },
  ],
  render: (ctx) => {
    const rent = Number(ctx.f.amount_due ?? 0)
    const fee = Number(ctx.f.late_fee ?? 0)
    return wrap(ctx, 'Notice of Past-Due Rent', `
      <p>Our records show your rent is still unpaid. This is a formal notice that the following amount is past due.</p>
      <table class="doc-terms">
        <tr><th>Rent past due</th><td>${money(rent)}</td></tr>
        ${fee > 0 ? `<tr><th>Late fee</th><td>${money(fee)}</td></tr>` : ''}
        <tr class="doc-total"><th>Total now due</th><td>${money(rent + fee)}</td></tr>
        <tr><th>Originally due</th><td>${longDate(ctx.f.due_date as string)}</td></tr>
      </table>
      <p>Please bring your account current as soon as possible. If you're dealing with a hardship, contact us right away — we'd rather work out a plan than let this escalate.</p>
    `)
  },
}

// ── Late Payment Series — Day 15 (Pay or Quit, ORC 1923) ────────────────────

const latePaymentD15: TemplateDef = {
  type: 'late_payment_d15',
  state: 'OH',
  version: '1.0.0',
  label: 'Notice to Leave the Premises (Pay or Quit)',
  description: 'Ohio 3-day notice to leave the premises for non-payment (ORC 1923.04).',
  requiresSignature: true,
  deliveryRule: 'email_or_esign',
  fields: [
    { key: 'total_due', label: 'Total amount due', type: 'number', required: true, prefill: 'overdue_amount' },
    { key: 'cure_by', label: 'Pay by date', type: 'date', required: true, help: 'Ohio non-payment notices give at least 3 days.' },
    { key: 'county', label: 'County (for the court reference)', type: 'text', required: true, help: 'Where the rental is located, e.g. Franklin.' },
  ],
  render: (ctx) => wrap(ctx, 'Notice to Leave the Premises', `
    <p class="doc-statutory">You are being asked to leave the premises listed above. If you do not leave, an eviction action may be filed against you, and you may be evicted under Ohio Revised Code Chapter 1923.</p>
    <p>Rent for your home is past due. To resolve this, the full amount below must be paid by the date shown.</p>
    <table class="doc-terms">
      <tr class="doc-total"><th>Total amount due</th><td>${money(ctx.f.total_due)}</td></tr>
      <tr><th>Pay in full by</th><td>${longDate(ctx.f.cure_by as string)}</td></tr>
    </table>
    <p>If the full amount is paid by that date, you may stay and this notice is withdrawn. If it isn't paid, an eviction (forcible entry and detainer) action may be filed in the ${esc(ctx.f.county)} County Municipal Court. Court filing fees in Ohio are typically $100–$150.</p>
    <p>You have legal rights as a tenant. Ohio Legal Help has free information and a referral tool at <strong>ohiolegalhelp.org</strong>. We encourage you to use it.</p>
  `),
}

// ── Move-Out Instructions ───────────────────────────────────────────────────

const moveOut: TemplateDef = {
  type: 'move_out',
  state: 'OH',
  version: '1.0.0',
  label: 'Move-Out Instructions',
  description: 'What the tenant needs to do to wrap up their tenancy cleanly.',
  requiresSignature: false,
  deliveryRule: 'any',
  fields: [
    { key: 'move_out_date', label: 'Move-out date', type: 'date', required: true, prefill: 'lease_end' },
    { key: 'inspection_date', label: 'Walk-through inspection (optional)', type: 'date' },
    { key: 'key_return', label: 'How to return keys', type: 'text', required: true, help: 'e.g. Drop in the office lockbox.' },
    { key: 'forwarding', label: 'Forwarding-address request', type: 'textarea', help: 'How the tenant should send their new address for the deposit.' },
  ],
  render: (ctx) => wrap(ctx, 'Move-Out Instructions', `
    <p>As your move-out on <strong>${longDate(ctx.f.move_out_date as string)}</strong> gets closer, here's everything you need to wrap things up smoothly and get your deposit back quickly.</p>
    <h2 class="doc-h2">Before you go</h2>
    <ul class="doc-list">
      <li>Remove all belongings and trash.</li>
      <li>Clean the unit — floors, appliances, bathrooms, and fixtures.</li>
      <li>Return the home to the condition noted in your move-in inspection (normal wear and tear aside).</li>
    </ul>
    <h2 class="doc-h2">Keys</h2>
    <p>${esc(ctx.f.key_return)}</p>
    ${ctx.f.inspection_date ? `<h2 class="doc-h2">Walk-through</h2><p>We'd like to do a walk-through with you on <strong>${longDate(ctx.f.inspection_date as string)}</strong>. It's the best way to catch anything before it affects your deposit.</p>` : ''}
    <h2 class="doc-h2">Your deposit</h2>
    <p>Under Ohio law (ORC 5321.16), we'll return your deposit — minus any itemized deductions — within 30 days of move-out, once we have your forwarding address.</p>
    ${ctx.f.forwarding ? paragraphs(ctx.f.forwarding) : ''}
  `),
}

// ── Security Deposit Disposition Letter ─────────────────────────────────────

const securityDeposit: TemplateDef = {
  type: 'security_deposit',
  state: 'OH',
  version: '1.1.0',
  label: 'Security Deposit Disposition',
  description: 'Itemize what was kept and what is being returned (ORC 5321.16).',
  requiresSignature: false,
  deliveryRule: 'any',
  fields: [
    { key: 'move_out_date', label: 'Tenancy ended on', type: 'date', required: true, prefill: 'lease_end' },
    { key: 'deposit_amount', label: 'Original deposit', type: 'number', required: true, prefill: 'security_deposit' },
    { key: 'deductions', label: 'Itemized deductions', type: 'textarea', required: true, help: 'One per line: what it was for and the amount. Ohio does not allow deductions for ordinary wear and tear.' },
    { key: 'total_deductions', label: 'Total deductions', type: 'number', required: true },
    { key: 'amount_returned', label: 'Amount being returned', type: 'number', required: true },
    { key: 'forwarding_address', label: 'Forwarding address (optional)', type: 'textarea', help: 'Where the refund is being sent. Leave blank if delivered another way.' },
  ],
  render: (ctx) => {
    const total = Number(ctx.f.total_deductions ?? 0)
    const deposit = Number(ctx.f.deposit_amount ?? 0)
    const balanceOwed = Math.round(Math.max(0, total - deposit) * 100) / 100
    return wrap(ctx, 'Security Deposit Disposition', `
      <p>Thanks for returning your home. Your tenancy ended on <strong>${longDate(ctx.f.move_out_date as string)}</strong>, and this is the itemized accounting of your security deposit required under <strong>Ohio Revised Code § 5321.16</strong>, which calls for the itemized statement and any refund within 30 days of the end of the tenancy.</p>
      <table class="doc-terms">
        <tr><th>Original deposit</th><td>${money(ctx.f.deposit_amount)}</td></tr>
        <tr><th>Total deductions</th><td>${money(ctx.f.total_deductions)}</td></tr>
        <tr class="doc-total"><th>Amount returned to you</th><td>${money(ctx.f.amount_returned)}</td></tr>
        ${balanceOwed > 0 ? `<tr><th>Balance remaining owed</th><td>${money(balanceOwed)}</td></tr>` : ''}
      </table>
      <h2 class="doc-h2">Itemized deductions</h2>
      ${paragraphs(ctx.f.deductions)}
      <p>Each deduction above is for unpaid rent or damage beyond ordinary wear and tear — ordinary wear and tear has not been charged, as ORC § 5321.16 does not allow it.</p>
      ${balanceOwed > 0
        ? `<p>Because the deductions exceed the deposit, a balance of <strong>${money(balanceOwed)}</strong> remains. Please contact us to arrange payment.</p>`
        : ctx.f.forwarding_address
          ? `<p>Your refund is on its way to the forwarding address you provided:</p>${paragraphs(ctx.f.forwarding_address)}`
          : `<p>Your refund is enclosed or on its way to the forwarding address you gave us.</p>`}
      <p>If anything here looks off, reach out and we'll go over it with you.</p>
    `)
  },
}

// ── Maintenance Acknowledgment ──────────────────────────────────────────────

const maintenanceAck: TemplateDef = {
  type: 'maintenance_ack',
  state: 'OH',
  version: '1.0.0',
  label: 'Maintenance Acknowledgment',
  description: 'Confirm you received a maintenance request and what happens next.',
  requiresSignature: false,
  deliveryRule: 'any',
  fields: [
    { key: 'request_summary', label: 'What they reported', type: 'textarea', required: true },
    { key: 'received_date', label: 'Request received', type: 'date', required: true, prefill: 'today' },
    { key: 'expected_timeline', label: 'When you expect to address it', type: 'text', required: true, help: 'e.g. Within 3 business days.' },
  ],
  render: (ctx) => wrap(ctx, 'We Got Your Maintenance Request', `
    <p>Thanks for letting us know — we received your maintenance request on <strong>${longDate(ctx.f.received_date as string)}</strong>. Here's what you reported:</p>
    ${paragraphs(ctx.f.request_summary)}
    <h2 class="doc-h2">What happens next</h2>
    <p>We expect to address this <strong>${esc(ctx.f.expected_timeline)}</strong>. We'll be in touch to coordinate access if we need to come into your home. If this is an emergency — no heat, a major leak, anything unsafe — call us right away.</p>
  `),
}

// ── Lease Violation Notice ──────────────────────────────────────────────────

const leaseViolation: TemplateDef = {
  type: 'lease_violation',
  state: 'OH',
  version: '1.0.0',
  label: 'Lease Violation Notice',
  description: 'Document a lease violation and the steps to fix it.',
  requiresSignature: false,
  deliveryRule: 'any',
  fields: [
    { key: 'violation', label: 'What the violation is', type: 'textarea', required: true },
    { key: 'lease_section', label: 'Lease section (optional)', type: 'text', help: 'e.g. Section 12 — Pets.' },
    { key: 'cure_by', label: 'Fix it by', type: 'date', required: true },
    { key: 'consequences', label: 'What happens if it isn’t fixed', type: 'textarea', help: 'Optional plain-language note.' },
  ],
  render: (ctx) => wrap(ctx, 'Notice of Lease Violation', `
    <p>We need to flag something that doesn't line up with your lease. We're sending this so it's on the record and so you have a clear chance to fix it.</p>
    <h2 class="doc-h2">The issue</h2>
    ${paragraphs(ctx.f.violation)}
    ${ctx.f.lease_section ? `<p><strong>Lease reference:</strong> ${esc(ctx.f.lease_section)}</p>` : ''}
    <h2 class="doc-h2">What we're asking</h2>
    <p>Please resolve this by <strong>${longDate(ctx.f.cure_by as string)}</strong>.</p>
    ${ctx.f.consequences ? paragraphs(ctx.f.consequences) : ''}
    <p>If you think this is a misunderstanding, let's talk — reach out and we'll sort it out.</p>
  `),
}

// ── Entry Notice (Ohio: reasonable notice, presumed 24 hours) ───────────────

const entryNotice: TemplateDef = {
  type: 'entry_notice',
  state: 'OH',
  version: '1.0.0',
  label: 'Notice of Entry',
  description: 'Give advance notice before entering the unit (ORC 5321.04).',
  requiresSignature: false,
  deliveryRule: 'any',
  fields: [
    { key: 'entry_date', label: 'Date of entry', type: 'date', required: true },
    { key: 'entry_window', label: 'Time window', type: 'text', required: true, help: 'e.g. Between 9:00 AM and 12:00 PM.' },
    { key: 'reason', label: 'Reason for entry', type: 'textarea', required: true },
  ],
  render: (ctx) => wrap(ctx, 'Notice of Entry', `
    <p>This is advance notice that we'll need to enter your home. Ohio law (ORC 5321.04) asks landlords to give reasonable notice — generally at least 24 hours — before entering, except in an emergency.</p>
    <table class="doc-terms">
      <tr><th>Date</th><td>${longDate(ctx.f.entry_date as string)}</td></tr>
      <tr><th>Time</th><td>${esc(ctx.f.entry_window)}</td></tr>
    </table>
    <h2 class="doc-h2">Why we're coming by</h2>
    ${paragraphs(ctx.f.reason)}
    <p>If that time doesn't work, reach out and we'll find one that does.</p>
  `),
}

export const OHIO_TEMPLATES: TemplateDef[] = [
  leaseRenewal,
  rentIncrease,
  latePaymentD5,
  latePaymentD10,
  latePaymentD15,
  moveOut,
  securityDeposit,
  maintenanceAck,
  leaseViolation,
  entryNotice,
]
