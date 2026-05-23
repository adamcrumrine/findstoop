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
