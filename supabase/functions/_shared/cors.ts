// Tighter CORS than wildcard '*'. Wildcard would let any malicious site call
// our edge functions using a victim's auth token. We restrict to:
//   • https://findstoop.com  (production)
//   • https://www.findstoop.com  (apex + www)
//   • https://*.vercel.app   (preview deploys — wildcard match)
//   • http://localhost:5173  (Vite dev server)
//
// For webhooks (Stripe, Checkr) and other non-browser callers, CORS doesn't
// apply — they can still call regardless. This only affects browser fetches.

const ALLOWED_ORIGINS = new Set<string>([
  'https://findstoop.com',
  'https://www.findstoop.com',
  'http://localhost:5173',
  'http://localhost:4173',
])

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  if (ALLOWED_ORIGINS.has(origin)) return true
  // Vercel preview deploys
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return true
  return false
}

/**
 * Build CORS headers scoped to the incoming Origin header. Returns wildcard
 * NEVER — if the origin isn't recognized, no Allow-Origin is set, and the
 * browser will reject the response.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  const allowed = isAllowedOrigin(origin)
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
  if (allowed && origin) base['Access-Control-Allow-Origin'] = origin
  return base
}

/** Standard preflight responder. */
export function corsPreflight(req: Request): Response {
  return new Response('ok', { headers: corsHeaders(req) })
}
