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
