// Password strength + breach checking, all client-side.
//
// Uses Troy Hunt's Have I Been Pwned k-anonymity API:
//   1. SHA-1 hash the password locally
//   2. Send only the first 5 chars of the hash to https://api.pwnedpasswords.com/range/{prefix}
//   3. Server returns every hash suffix it knows for that prefix + the leak count
//   4. We check locally whether our suffix is in the response
// The full password (or full hash) is NEVER sent to the network.

/** Minimum length we accept regardless of strength. */
const MIN_LENGTH = 10

/**
 * Check whether a password appears in HaveIBeenPwned's leaked-password corpus.
 * Returns the number of times it's been seen in leaks (0 = safe).
 * Fails open (returns 0) if HIBP is unreachable — security-by-availability tradeoff.
 */
export async function hibpCheckPassword(password: string): Promise<number> {
  try {
    const hash = await sha1Hex(password)
    const prefix = hash.slice(0, 5).toUpperCase()
    const suffix = hash.slice(5).toUpperCase()

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
    })
    if (!res.ok) return 0
    const body = await res.text()

    // Each line: "{SUFFIX}:{COUNT}"
    for (const line of body.split('\n')) {
      const [s, count] = line.trim().split(':')
      if (s === suffix) return parseInt(count, 10) || 0
    }
    return 0
  } catch {
    return 0 // fail open
  }
}

async function sha1Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-1', buf)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

interface StrengthResult {
  ok: boolean
  reason?: string
}

/**
 * Lightweight password strength rules. Catches the obviously-bad cases
 * (too short, single character class, contains the email handle, etc.).
 * Pair with `hibpCheckPassword` for the heavy lift.
 */
export function checkPasswordStrength(password: string, email?: string): StrengthResult {
  if (password.length < MIN_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_LENGTH} characters` }
  }
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length
  if (classes < 3) {
    return { ok: false, reason: 'Use at least 3 of: lowercase, uppercase, numbers, symbols' }
  }
  if (email) {
    const handle = email.split('@')[0]?.toLowerCase()
    if (handle && handle.length >= 4 && password.toLowerCase().includes(handle)) {
      return { ok: false, reason: 'Password should not contain your email handle' }
    }
  }
  return { ok: true }
}
