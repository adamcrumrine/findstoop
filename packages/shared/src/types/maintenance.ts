export type MaintenancePriority = 'low' | 'medium' | 'high' | 'emergency'
export type MaintenanceStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface MaintenanceRequest {
  id: string
  unit_id: string
  tenant_id: string
  title: string
  description: string | null
  priority: MaintenancePriority
  status: MaintenanceStatus
  images: string[] | null
  created_at: string
  resolved_at: string | null
}
