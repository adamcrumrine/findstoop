// Cloudflare Turnstile — server-side verification of the "are you human"
// token the browser gets from the widget (components/shared/HumanCheck.tsx).
//
// Off until the TURNSTILE_SECRET_KEY secret is set: verifyHuman() returns
// true, so the code can ship ahead of the Cloudflare keys. Once the secret is
// set, a missing or bad token fails — set VITE_TURNSTILE_SITE_KEY on the web
// app (and redeploy it) BEFORE setting this secret, or real users get blocked.
//
// Auth (signup / sign-in / password reset) doesn't go through here: Supabase
// Auth verifies the same token itself once captcha is enabled in its config.

const SECRET = Deno.env.get('TURNSTILE_SECRET_KEY') ?? ''

/** True when the human check is switched on server-side. */
export const humanCheckEnabled = SECRET.length > 0

/**
 * True when the caller passed the human check (or the check is off).
 * Fails CLOSED once enabled: if Cloudflare can't be reached, the request is
 * refused rather than waved through.
 */
export async function verifyHuman(token: string | null | undefined, ip?: string | null): Promise<boolean> {
  if (!humanCheckEnabled) return true
  if (!token) return false
  try {
    const form = new FormData()
    form.append('secret', SECRET)
    form.append('response', token)
    if (ip && ip !== 'unknown') form.append('remoteip', ip)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
    const out = await res.json() as { success?: boolean }
    return out.success === true
  } catch {
    return false
  }
}
