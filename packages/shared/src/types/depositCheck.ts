// Result shape for the deposit-fairness check (check-deposit edge function).

export type DeductionVerdict = 'fair' | 'questionable' | 'unfair'

export interface DepositCheckResult {
  summary: string
  state_detected: string | null
  deposit_amount: number | null
  total_deducted: number | null
  amount_returned: number | null
  within_30_days: boolean | null
  itemized: boolean
  deductions: Array<{
    label: string
    amount: number | null
    verdict: DeductionVerdict
    why: string
    statute_cite: string | null
  }>
  likely_owed_back: number | null
  your_rights: Array<{ right: string; plain_english: string; statute_cite: string | null }>
  questions_to_ask: string[]
}

export interface CheckDepositResponse {
  ok: boolean
  analysis?: DepositCheckResult
  message?: string
}
