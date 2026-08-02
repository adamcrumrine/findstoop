import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'

// Multi-select filter chip.
//
// Replaces the single <select> that every list page used for status, where the
// only choices were one value or "All". A manager chasing money wants "failed
// AND past due" and had to look at them separately or look at everything.
//
// Selecting nothing means no filter, not an empty result. That's the only
// reading that makes an empty state honest: a manager who has just cleared
// every checkbox is asking to stop filtering, not asking to see zero rows.

export interface MultiSelectOption {
  value: string
  label: string
}

interface Props {
  /** Shown when nothing is selected — e.g. "All statuses". */
  allLabel: string
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  /** Optional short noun for the summary, e.g. "statuses" → "3 statuses". */
  noun?: string
}

export default function MultiSelect({ allLabel, options, selected, onChange, noun }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape — a filter popover that traps you is worse
  // than no popover.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  // One selection reads better by name than as "1 status".
  const summary = selected.length === 0
    ? allLabel
    : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? `1 ${noun ?? 'selected'}`)
      : `${selected.length} ${noun ?? 'selected'}`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 ${
          selected.length > 0 ? 'border-brand-400 text-ink font-medium' : 'border-gray-300 text-ink'
        }`}
      >
        {summary}
        {selected.length > 0 ? (
          <X
            className="w-3.5 h-3.5 text-mute hover:text-ink"
            strokeWidth={2}
            role="button"
            aria-label={`Clear ${noun ?? 'filter'}`}
            onClick={(e) => { e.stopPropagation(); onChange([]) }}
          />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-mute" strokeWidth={2} />
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute z-20 mt-1 min-w-[13rem] max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg py-1"
        >
          {options.map((o) => {
            const on = selected.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(o.value)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50"
              >
                <span className={`w-4 h-4 rounded border inline-flex items-center justify-center shrink-0 ${
                  on ? 'bg-brand-500 border-brand-500' : 'border-gray-300'
                }`}>
                  {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </span>
                <span className="text-ink">{o.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
