// Status pill for a generated document. Colors per the feature spec:
// Draft = gray, Pending Review = amber, Sent = teal, Signed = green, Voided = red.

import type { DocStatus } from '@findstoop/shared/types/generatedDocument'

const STATUS: Record<DocStatus, { label: string; cls: string }> = {
  draft:          { label: 'Draft',          cls: 'bg-gray-100 text-gray-600' },
  pending_review: { label: 'Pending Review', cls: 'bg-amber-100 text-amber-700' },
  sent:           { label: 'Sent',           cls: 'bg-brand-100 text-brand-700' },
  signed:         { label: 'Signed',         cls: 'bg-green-100 text-green-700' },
  voided:         { label: 'Voided',         cls: 'bg-red-100 text-red-600' },
}

export default function DocStatusBadge({ status }: { status: DocStatus }) {
  const s = STATUS[status] ?? STATUS.draft
  return (
    <span className={`inline-flex items-center text-[11px] font-medium rounded-full px-2.5 py-0.5 ${s.cls}`}>
      {s.label}
    </span>
  )
}
