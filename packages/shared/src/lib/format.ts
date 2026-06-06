// Shared formatting helpers — applied consistently across manager and tenant
// portals so dollar amounts always have thousand-separators.

// USD whole-dollar — no cents. Use for rent, deposits, plan totals.
//   formatUsd(1500)   -> "$1,500"
//   formatUsd(15000)  -> "$15,000"
export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '$0'
  return `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

// USD with cents — for payments, surcharges, invoice lines.
//   formatUsdCents(1500)    -> "$1,500.00"
//   formatUsdCents(1500.75) -> "$1,500.75"
export function formatUsdCents(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '$0.00'
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Render a YYYY-MM-DD (date-only, no time / no timezone) as a local
// date string. JS's `new Date('2026-06-01')` parses as UTC midnight,
// which `.toLocaleDateString()` then shifts back a day for any
// behind-UTC zone (the user sees 5/31 for a 6/1 due date). Appending
// "T00:00:00" anchors it to local midnight instead.
//   formatLocalDate("2026-06-01") -> "6/1/2026" (regardless of zone)
//   formatLocalDate("2026-06-01T18:00:00Z") -> still works (passed
//     through unchanged; full timestamps already render correctly)
export function formatLocalDate(value: string | null | undefined): string {
  if (!value) return ''
  const s = String(value)
  // If it's a pure date (no time component), pin to local midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(s + 'T00:00:00').toLocaleDateString()
  }
  return new Date(s).toLocaleDateString()
}

// "Aug 2025" — the month a charge applies to, ignoring the specific day.
export function formatMonthYear(value: string | null | undefined): string {
  if (!value) return ''
  const s = String(value)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// US phone formatter. Strips non-digits, then renders as (###) ###-####.
// 11-digit numbers starting with "1" are treated as US country-coded and
// the leading 1 is dropped. Anything that isn't 10 digits after stripping
// is returned as-is so we don't silently mangle international numbers.
//   formatPhone("6144004091")    -> "(614) 400-4091"
//   formatPhone("+1 614-400-4091") -> "(614) 400-4091"
export function formatPhone(value: string | null | undefined): string {
  if (!value) return ''
  let digits = String(value).replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  if (digits.length !== 10) return String(value)
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

// US address formatter for single-line freeform input. Title-cases the
// street and city, uppercases the state (2-letter), and normalizes
// whitespace + comma spacing. Idempotent — safe to apply on display.
//   formatAddress("123 main st, columbus, oh 43210")
//     -> "123 Main St, Columbus, OH 43210"
//   formatAddress("  456 NORTH HIGH STREET,UPPER ARLINGTON ,oh  43212-1234")
//     -> "456 North High Street, Upper Arlington, OH 43212-1234"
//
// Tokens that look like a 2-letter state code (alone in a segment) get
// uppercased; ZIP codes (5 or 9 digits) are passed through; everything
// else gets title-cased word-by-word, leaving short connectors like
// "of", "and", "the" lowercase EXCEPT when they're the first word.
export function formatAddress(value: string | null | undefined): string {
  if (!value) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  // Split on commas, normalize each segment's internal whitespace.
  const segments = raw.split(',').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean)
  const result = segments.map((seg) => {
    // Pull off a trailing state + ZIP if present in the final segment:
    //   "Upper Arlington OH 43210" → "Upper Arlington, OH 43210"? — no,
    //   keep within the same segment, just normalize casing.
    const tokens = seg.split(' ')
    return tokens.map((tok, i) => {
      if (/^\d{5}(-\d{4})?$/.test(tok)) return tok                  // ZIP
      if (/^[A-Za-z]{2}$/.test(tok) && i === tokens.length - 2) {
        // 2-letter token directly before a ZIP → state code
        if (/^\d{5}(-\d{4})?$/.test(tokens[tokens.length - 1])) return tok.toUpperCase()
      }
      if (/^[A-Za-z]{2}$/.test(tok) && i === tokens.length - 1 && tokens.length === 1) {
        // Standalone segment that's just a state code
        return tok.toUpperCase()
      }
      return titleCaseWord(tok, i === 0)
    }).join(' ')
  })
  return result.join(', ')
}

// Title-case one word. Lowercase short connectors mid-phrase, but always
// capitalize when it's the leading word of a segment. Preserves
// embedded apostrophes (e.g. "O'Brien" stays O'Brien).
function titleCaseWord(word: string, isFirst: boolean): string {
  const SMALL_WORDS = new Set(['of', 'and', 'the', 'in', 'on', 'at', 'by', 'for', 'to'])
  const lower = word.toLowerCase()
  if (!isFirst && SMALL_WORDS.has(lower)) return lower
  // Preserve hyphenated/possessive boundaries.
  return lower.replace(/(^|[\s\-'’])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}
