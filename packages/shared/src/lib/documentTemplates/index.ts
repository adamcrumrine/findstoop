// Document-template registry.
//
// Lookups are keyed by (DocType × state). Templates are code (see ohio.ts),
// so adding a state means adding a module and registering it here — no DB
// migration, no Handlebars.

import { OHIO_TEMPLATES } from './ohio'
import type { TemplateDef, DocumentContext } from './helpers'
import type { DocType } from '../../types/generatedDocument'

export type { TemplateDef, TemplateField, DocumentContext, FieldType } from './helpers'

// registry[state][type]
const REGISTRY: Record<string, Partial<Record<DocType, TemplateDef>>> = {
  OH: Object.fromEntries(OHIO_TEMPLATES.map((t) => [t.type, t])) as Partial<Record<DocType, TemplateDef>>,
}

export function getTemplate(type: DocType, state: string): TemplateDef | null {
  const code = (state ?? '').trim().toUpperCase()
  return REGISTRY[code]?.[type] ?? null
}

export function renderDocument(type: DocType, state: string, ctx: DocumentContext): string {
  const tpl = getTemplate(type, state)
  if (!tpl) throw new Error(`No ${type} template for ${state}`)
  return tpl.render(ctx)
}

// ── Builder catalog — the 9 cards on Step 1 (3×3 grid) ──────────────────────
// `late_payment` is one card that resolves to the right escalation step;
// `eviction_prep` is an organizational tool, not a generated letter.

export interface DocCatalogEntry {
  key: string
  label: string
  description: string
  icon: string // lucide icon name; mapped in the builder UI
  docType?: DocType // direct single-step documents
  series?: boolean // late-payment series (resolves to a step)
  tool?: boolean // eviction prep — links out, generates no letter
}

export const DOC_CATALOG: DocCatalogEntry[] = [
  { key: 'rent_increase', label: 'Rent Increase', description: 'Tell a tenant rent is changing and when.', icon: 'TrendingUp', docType: 'rent_increase' },
  { key: 'lease_renewal', label: 'Lease Renewal', description: 'Offer a new term before the lease ends.', icon: 'CalendarCheck', docType: 'lease_renewal' },
  { key: 'late_payment', label: 'Late Rent Notice', description: 'A guided 3-step series: reminder → notice → pay-or-quit.', icon: 'AlarmClock', series: true },
  { key: 'move_out', label: 'Move-Out Instructions', description: 'How to wrap up a tenancy cleanly.', icon: 'DoorOpen', docType: 'move_out' },
  { key: 'security_deposit', label: 'Deposit Disposition', description: 'Itemize what was kept and what is returned.', icon: 'Wallet', docType: 'security_deposit' },
  { key: 'maintenance_ack', label: 'Maintenance Acknowledgment', description: 'Confirm a request and what happens next.', icon: 'Wrench', docType: 'maintenance_ack' },
  { key: 'lease_violation', label: 'Lease Violation', description: 'Document an issue and the steps to fix it.', icon: 'AlertTriangle', docType: 'lease_violation' },
  { key: 'entry_notice', label: 'Entry Notice', description: 'Give advance notice before entering a unit.', icon: 'KeyRound', docType: 'entry_notice' },
  { key: 'eviction_prep', label: 'Eviction Prep', description: 'Get organized for court — timeline, checklist, records.', icon: 'FolderOpen', tool: true },
]
