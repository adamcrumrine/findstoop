export type PaymentType = 'rent' | 'late_fee' | 'pet_fee' | 'pet_deposit' | 'utility' | 'other'
export type PaymentStatus = 'pending' | 'completed' | 'failed'

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
  created_at: string
}
