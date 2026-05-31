// Pure expense math for the Schedule E worksheet — extracted so it can be
// unit-tested independently of the print page.
import { EXPENSE_CATEGORY_META } from '@findstoop/shared/types/expense'
import type { ExpenseCategory } from '@findstoop/shared/types/expense'

export type ExpenseByCategory = Partial<Record<ExpenseCategory, number>>

/** Sum a flat list of expense rows into per-category totals. */
export function sumByCategory(rows: { category: ExpenseCategory; amount: number | string }[]): ExpenseByCategory {
  const m: ExpenseByCategory = {}
  for (const r of rows) m[r.category] = (m[r.category] ?? 0) + Number(r.amount)
  return m
}

/** Total of all expense categories (Schedule E line 20 = sum of lines 5–19). */
export function categoryTotal(byCat: ExpenseByCategory): number {
  return EXPENSE_CATEGORY_META.reduce((s, c) => s + (byCat[c.key] ?? 0), 0)
}

/** Net income or loss (Schedule E line 21 = income − total expenses). */
export function netIncome(income: number, byCat: ExpenseByCategory): number {
  return income - categoryTotal(byCat)
}
