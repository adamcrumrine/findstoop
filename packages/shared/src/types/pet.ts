export type PetType = 'dog' | 'cat' | 'other'

export interface Pet {
  id: string
  lease_id: string
  tenant_id: string
  name: string
  type: PetType
  breed: string | null
  weight: number | null
  pet_deposit: number | null
  monthly_pet_fee: number | null
  created_at: string
}
