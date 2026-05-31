import { supabase } from '../lib/supabase'
import type { PropertyExpense, ExpenseCategory } from '../types/expense'

// RLS scopes property_expenses to the manager who owns the property, but we
// pass property ids so the query is also explicitly bounded.
export async function getExpenses(propertyIds: string[], year?: number): Promise<PropertyExpense[]> {
  if (propertyIds.length === 0) return []
  let q = supabase
    .from('property_expenses')
    .select('*')
    .in('property_id', propertyIds)
    .order('expense_date', { ascending: false })
  if (year) q = q.gte('expense_date', `${year}-01-01`).lt('expense_date', `${year + 1}-01-01`)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

export interface NewExpense {
  property_id: string
  category: ExpenseCategory
  amount: number
  expense_date: string
  vendor?: string | null
  note?: string | null
}

export async function createExpense(input: NewExpense): Promise<PropertyExpense> {
  const { data, error } = await supabase.from('property_expenses').insert(input).select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('property_expenses').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
