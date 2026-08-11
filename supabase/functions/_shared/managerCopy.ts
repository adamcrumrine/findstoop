// Who gets a copy of a tenant-facing email.
//
// Policy: when Stoop emails a tenant on a landlord's behalf, the landlord is
// CC'd. They are a party to the tenancy, the reply-to already points at them,
// and a visible CC means a tenant who hits reply-all reaches their landlord
// rather than a noreply address.
//
// ─────────────────────────────────────────────────────────────────────────
// The exception, which matters more than the rule
// ─────────────────────────────────────────────────────────────────────────
// NEVER copy anyone on an email that carries a sign-in link.
//
// Supabase action links are BEARER TOKENS: opening one signs you in AS THAT
// TENANT. Copying the landlord on such an email hands them a working login to
// their own tenant's account, and — because the links are single-use — a
// landlord who clicks "just to check" burns the link the tenant needed.
//
// invite-tenant learned this the hard way and dropped its copy entirely; this
// module exists so that decision lives somewhere reusable instead of as a
// comment in one function. When an email must both carry a link and leave the
// landlord a record, send the landlord a SEPARATE, link-free confirmation.
// sendManagerConfirmation below is that pattern.

/** Normalize for comparison — addresses are case-insensitive in practice. */
function norm(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

/**
 * The CC list for a tenant-facing email, or undefined when there is nothing
 * to copy.
 *
 * Returns undefined when:
 *  - the landlord has no address on file, or
 *  - the landlord IS the recipient. Landlords testing with their own address,
 *    and landlords who also hold a lease, would otherwise get the message
 *    twice — some providers collapse that into a threaded duplicate, others
 *    just deliver two copies.
 *
 * @param managerEmail   the owning landlord's address
 * @param recipientEmail the tenant the message is addressed to
 */
export function managerCc(
  managerEmail: string | null | undefined,
  recipientEmail: string | null | undefined,
): string[] | undefined {
  const mgr = norm(managerEmail)
  if (!mgr) return undefined
  if (mgr === norm(recipientEmail)) return undefined
  return [mgr]
}

/**
 * True when an email body carries a Supabase auth action link, i.e. a bearer
 * token that must not be copied to anyone.
 *
 * A belt-and-braces guard for call sites that build a body conditionally and
 * might not know whether a link ended up in it. Prefer simply not passing a
 * CC when you know the email is a sign-in email; use this when you don't.
 */
export function containsSignInLink(html: string): boolean {
  return /[?&]token=|\/auth\/v1\/verify|type=(magiclink|invite|recovery|signup)/i.test(html)
}

/**
 * CC guarded by the link check: returns undefined if the body turns out to
 * carry a sign-in link, whatever the caller intended.
 */
export function safeManagerCc(
  managerEmail: string | null | undefined,
  recipientEmail: string | null | undefined,
  html: string,
): string[] | undefined {
  if (containsSignInLink(html)) return undefined
  return managerCc(managerEmail, recipientEmail)
}
