import { useLocation } from 'react-router-dom'
import { Building2, DoorClosed, X } from 'lucide-react'
import { useScope, ALL } from '../../lib/scope'

// Portfolio scope selector, rendered once above the page outlet so it is
// present on every manager screen rather than reimplemented per page.
//
// An allowlist, not a blocklist — the bar appears only where a page actually
// reads the scope and narrows itself. A control that visibly does nothing
// teaches a manager to distrust the ones that do, so an unwired page shows no
// bar rather than a dead one. Add the route here in the same change that makes
// the page consume useScope().
//
// Account-level routes (Settings, Billing, Import) will never appear here:
// they aren't about a property.
const SHOWN_ON = [
  '/manager/payments',
]

const selectClass =
  'text-sm border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 bg-white appearance-none ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-500'

export default function ScopeBar() {
  const { pathname } = useLocation()
  const { propertyId, unitId, setPropertyId, setUnitId, properties, units, isNarrowed, clear } = useScope()

  if (!SHOWN_ON.some((p) => pathname.startsWith(p))) return null
  // A single-property landlord gains nothing from a chooser with one entry.
  // The unit filter still earns its place on a duplex.
  if (properties.length === 0) return null

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      {properties.length > 1 && (
        <div className="relative">
          <Building2 className="w-4 h-4 text-mute absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.75} />
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            aria-label="Filter by property"
            className={selectClass}
          >
            <option value={ALL}>All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name ?? p.address}</option>
            ))}
          </select>
        </div>
      )}

      {units.length > 1 && (
        <div className="relative">
          <DoorClosed className="w-4 h-4 text-mute absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.75} />
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            aria-label="Filter by unit"
            className={selectClass}
          >
            <option value={ALL}>
              {propertyId === ALL ? 'All units' : `All units in this property`}
            </option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.unit_number ? `Unit ${u.unit_number}` : 'Unit'}
              </option>
            ))}
          </select>
        </div>
      )}

      {isNarrowed && (
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 text-xs text-mute hover:text-ink px-2 py-1.5"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2} />
          Clear filter
        </button>
      )}
    </div>
  )
}
