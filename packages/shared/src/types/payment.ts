export type PaymentType = 'rent' | 'late_fee' | 'pet_fee' | 'pet_deposit' | 'utility' | 'fee' | 'fine' | 'credit' | 'other'
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'disputed' | 'refunded'

export interface Payment {
  id: string
  lease_id: string
  tenant_id: string
  amount: number
  type: PaymentType
  status: PaymentStatus
  stripe_payment_id: string | null
  due_date: string | null
  paid_at: string | null
  memo: string | null
  // Scheduling + ACH tracking
  scheduled_for: string | null
  original_due_date: string | null
  initiated_at: string | null
  created_at: string
}
