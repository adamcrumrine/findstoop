import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import type { Property } from '@findstoop/shared/types/property'
import type { Unit } from '@findstoop/shared/types/unit'

// Portfolio scope — which property (and optionally which unit) the manager is
// looking at right now.
//
// Every page used to declare its own property <select>, its own state, and its
// own filter predicate. Ten near-identical copies, none of which agreed with
// each other: picking a property on Payments and then opening Maintenance
// dropped you back to the whole portfolio, and half the pages had no filter at
// all. Scope now lives in one place, above the router outlet, so it holds
// while the manager moves between pages.
//
// Backed by the URL rather than component state, which is what makes a
// filtered view shareable and survive a refresh — a landlord sending "here's
// the problem" to a contractor should be able to send the link.

export const ALL = 'all'

interface ScopeValue {
  /** Selected property id, or ALL. */
  propertyId: string
  /** Selected unit id, or ALL. Meaningless unless a property is selected. */
  unitId: string
  setPropertyId: (id: string) => void
  setUnitId: (id: string) => void
  /** Every property the manager owns. */
  properties: Property[]
  /** Units belonging to the selected property, or all units when scope is ALL. */
  units: Unit[]
  /** All units across the portfolio, unfiltered — for pages that need to
   *  resolve a unit that isn't in the current scope (e.g. labelling a row). */
  allUnits: Unit[]
  /**
   * Unit ids inside the current scope, or null when nothing is narrowed.
   *
   * null means "don't filter" rather than an empty array, so a page can't
   * accidentally render nothing when the manager hasn't chosen anything. Most
   * records hang off a unit, so this is the primitive pages actually need.
   */
  unitIdsInScope: string[] | null
  /** True when either filter is narrowing the view. */
  isNarrowed: boolean
  clear: () => void
}

const ScopeContext = createContext<ScopeValue | null>(null)

export function ScopeProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const { properties } = useProperties(profile?.id)
  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties])
  const { units: allUnits } = useUnits(propertyIds)

  const propertyId = params.get('property') || ALL
  const unitId = params.get('unit') || ALL

  const setPropertyId = (id: string) => {
    const next = new URLSearchParams(params)
    if (id === ALL) next.delete('property'); else next.set('property', id)
    // Changing property invalidates any unit choice — a unit belongs to
    // exactly one property, so keeping it would filter to nothing.
    next.delete('unit')
    setParams(next, { replace: true })
  }

  const setUnitId = (id: string) => {
    const next = new URLSearchParams(params)
    if (id === ALL) next.delete('unit'); else next.set('unit', id)
    setParams(next, { replace: true })
  }

  const clear = () => {
    const next = new URLSearchParams(params)
    next.delete('property')
    next.delete('unit')
    setParams(next, { replace: true })
  }

  const units = useMemo(
    () => (propertyId === ALL ? allUnits : allUnits.filter((u) => u.property_id === propertyId)),
    [allUnits, propertyId],
  )

  const unitIdsInScope = useMemo(() => {
    if (unitId !== ALL) return [unitId]
    if (propertyId === ALL) return null
    return units.map((u) => u.id)
  }, [propertyId, unitId, units])

  const value: ScopeValue = {
    propertyId, unitId, setPropertyId, setUnitId,
    properties, units, allUnits, unitIdsInScope,
    isNarrowed: propertyId !== ALL || unitId !== ALL,
    clear,
  }
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

/**
 * Read the current portfolio scope.
 *
 * Throws outside a provider rather than returning a permissive default: a page
 * that silently believes nothing is filtered would show the manager the whole
 * portfolio under a heading that says otherwise.
 */
export function useScope(): ScopeValue {
  const ctx = useContext(ScopeContext)
  if (!ctx) throw new Error('useScope must be used inside <ScopeProvider>')
  return ctx
}

/**
 * Does a record belong to the current scope?
 *
 * Pass whichever the record has — most carry a unit id, some only a property
 * id. A record with neither is always in scope; that's usually portfolio-level
 * data (a subscription invoice) that scope shouldn't hide.
 */
export function inScope(
  scope: Pick<ScopeValue, 'propertyId' | 'unitId' | 'unitIdsInScope'>,
  record: { unitId?: string | null; propertyId?: string | null },
): boolean {
  if (scope.unitId !== ALL) return record.unitId === scope.unitId
  if (scope.propertyId === ALL) return true
  if (record.propertyId) return record.propertyId === scope.propertyId
  if (record.unitId) return (scope.unitIdsInScope ?? []).includes(record.unitId)
  return true
}
