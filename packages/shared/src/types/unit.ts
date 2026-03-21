export type UnitStatus = 'occupied' | 'vacant' | 'maintenance'

export interface Unit {
  id: string
  property_id: string
  unit_number: string
  bedrooms: number | null
  bathrooms: number | null
  square_feet: number | null
  rent_amount: number
  status: UnitStatus
  created_at: string
}
