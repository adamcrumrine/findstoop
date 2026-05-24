// Where each role should land by default after sign-in / OAuth callback /
// hitting the marketing site while already logged in.
//
// One source of truth so we don't accidentally dump an admin into the
// manager portal again.

export type Role = 'admin' | 'manager' | 'tenant' | string | null | undefined

export function defaultPathForRole(role: Role): string {
  if (role === 'admin')  return '/admin/dashboard'
  if (role === 'tenant') return '/tenant/dashboard'
  // 'manager' and any unknown role default to manager dashboard
  return '/manager/dashboard'
}

/**
 * Which sign-in screen does this role land on if they're unauthenticated?
 * Used by ProtectedRoute when there's no session yet.
 */
export function loginPathForRole(role: Role): string {
  return role === 'tenant' ? '/login/renter' : '/login'
}
