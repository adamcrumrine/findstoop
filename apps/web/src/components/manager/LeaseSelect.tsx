import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { selectClass } from '../shared/FormField'
import type { LeaseStatus } from '@findstoop/shared/types/lease'

export interface LeaseOption {
  id: string
  label: string
  status: LeaseStatus
  end_date?: string | null
}

// Ended tenancies stay pickable — a final utility bill or a move-out charge
// can land after the lease is over — but they sink to the bottom, grey out,
// and ask before they're used, so a landlord doesn't bill a former tenant by
// accident.
export const isEndedLease = (status: LeaseStatus) => status === 'expired' || status === 'terminated'

export default function LeaseSelect({ leases, value, onChange, placeholder = 'Select a lease…', required }: {
  leases: LeaseOption[]
  value: string
  onChange: (leaseId: string) => void
  placeholder?: string | null
  required?: boolean
}) {
  const [pending, setPending] = useState<LeaseOption | null>(null)
  const current = leases.filter((l) => !isEndedLease(l.status))
  const ended = leases.filter((l) => isEndedLease(l.status))

  const pick = (id: string) => {
    const lease = leases.find((l) => l.id === id)
    if (lease && isEndedLease(lease.status)) setPending(lease)
    else onChange(id)
  }

  // This popup usually opens over another Modal, whose Escape handler sits on
  // document. Catch Escape first (window, capture phase) so it dismisses only
  // the warning, not the form underneath.
  useEffect(() => {
    if (!pending) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setPending(null)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [pending])

  const endedOn = pending?.end_date
    ? new Date(`${pending.end_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <>
      <select
        className={`${selectClass} ${value && ended.some((l) => l.id === value) ? 'text-gray-400' : ''}`}
        value={value}
        onChange={(e) => pick(e.target.value)}
        required={required}
      >
        {placeholder !== null && <option value="">{placeholder}</option>}
        {current.map((l) => (
          <option key={l.id} value={l.id}>{l.label}</option>
        ))}
        {ended.length > 0 && (
          <optgroup label="Expired leases">
            {ended.map((l) => (
              <option key={l.id} value={l.id} className="text-gray-400" style={{ color: '#9ca3af' }}>
                {l.label} (expired)
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {pending && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPending(null)} aria-hidden="true" />
          <div role="alertdialog" aria-modal="true" aria-labelledby="lease-expired-title"
            className="relative bg-white w-full max-w-sm rounded-2xl shadow-xl p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
              <div>
                <h2 id="lease-expired-title" className="text-base font-semibold text-gray-900">This lease has expired</h2>
                <p className="text-sm text-gray-600 mt-1.5">
                  {pending.label} {endedOn ? `ended ${endedOn}` : 'is no longer active'}. Anything you add
                  goes to a former tenant. Use it anyway?
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button type="button" onClick={() => setPending(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="button" autoFocus
                onClick={() => { onChange(pending.id); setPending(null) }}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-amber-600 hover:bg-amber-700 transition-colors">
                Use expired lease
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
