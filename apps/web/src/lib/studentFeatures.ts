// Where the student renter features turn on for a tenant.
//
// The Resources tab, the Dashboard "Renter resources" card, and the
// RenterResources hub (lease explainer, know-your-rights, move-in
// documentation, deposit protection) all gate on the SAME rule so a tenant's
// experience is consistent. A tenant is treated as a student when ANY of:
//
//   • they're on a {university}.findstoop.com subdomain (always on), OR
//   • their property has Student Housing mode on (properties.student_housing), OR
//   • their lease is marked a student lease (leases.is_student).
//
// The lease flag is read defensively: getTenantActiveLease selects `*`, so
// `is_student` is simply undefined until the additive migration is applied —
// a missing column can never throw here or blank the portal.

import { UNIVERSITY_SLUG } from './brand'
import type { Lease } from '@findstoop/shared/types/lease'

export function studentFeaturesOn(
  lease: Pick<Lease, 'is_student' | 'unit'> | null | undefined,
): boolean {
  if (UNIVERSITY_SLUG) return true
  return !!lease?.unit?.properties?.student_housing || !!lease?.is_student
}
