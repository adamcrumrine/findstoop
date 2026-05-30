export type ExpenseCategory =
  | 'advertising' | 'auto_travel' | 'cleaning_maintenance' | 'commissions'
  | 'insurance' | 'legal_professional' | 'management_fees' | 'mortgage_interest'
  | 'other_interest' | 'repairs' | 'supplies' | 'taxes' | 'utilities'
  | 'depreciation' | 'other'

export interface PropertyExpense {
  id: string
  property_id: string
  category: ExpenseCategory
  amount: number
  expense_date: string  // YYYY-MM-DD
  vendor: string | null
  note: string | null
  created_at: string
}

// Each category maps to a Schedule E (Form 1040) Part I expense line. Shared
// between the expense-entry UI (dropdown labels) and the Schedule E worksheet
// (which line each total fills). Kept in form order.
export const EXPENSE_CATEGORY_META: { key: ExpenseCategory; line: number; label: string }[] = [
  { key: 'advertising',          line: 5,  label: 'Advertising' },
  { key: 'auto_travel',          line: 6,  label: 'Auto and travel' },
  { key: 'cleaning_maintenance', line: 7,  label: 'Cleaning and maintenance' },
  { key: 'commissions',          line: 8,  label: 'Commissions' },
  { key: 'insurance',            line: 9,  label: 'Insurance' },
  { key: 'legal_professional',   line: 10, label: 'Legal and other professional fees' },
  { key: 'management_fees',      line: 11, label: 'Management fees' },
  { key: 'mortgage_interest',    line: 12, label: 'Mortgage interest paid to banks, etc.' },
  { key: 'other_interest',       line: 13, label: 'Other interest' },
  { key: 'repairs',              line: 14, label: 'Repairs' },
  { key: 'supplies',             line: 15, label: 'Supplies' },
  { key: 'taxes',                line: 16, label: 'Taxes' },
  { key: 'utilities',            line: 17, label: 'Utilities' },
  { key: 'depreciation',         line: 18, label: 'Depreciation expense or depletion' },
  { key: 'other',                line: 19, label: 'Other' },
]

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = Object.fromEntries(
  EXPENSE_CATEGORY_META.map((m) => [m.key, m.label]),
) as Record<ExpenseCategory, string>
