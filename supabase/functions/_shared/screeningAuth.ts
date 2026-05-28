// Capability-token check for the anonymous screening flow.
//
// The apply flow has no logged-in user, so the OCR/scoring edge functions
// can't authorize by auth.uid(). Instead start-screening issues a per-order
// `access_token` (see migration 20260528000004) which the applicant's browser
// holds and replays. Each function loads the order's stored token and compares
// it to the one supplied in the request. Service-role reads bypass RLS, so this
// token is the only thing standing between an order id and its PII — verify it
// before returning or computing anything.

/** Constant-time string compare — avoids leaking match length via timing. */
export function tokensMatch(provided: string | null | undefined, stored: string | null | undefined): boolean {
  if (!provided || !stored || provided.length !== stored.length) return false
  let diff = 0
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ stored.charCodeAt(i)
  return diff === 0
}
