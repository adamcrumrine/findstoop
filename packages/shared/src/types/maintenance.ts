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
  manager_notes: string | null
  created_at: string
  resolved_at: string | null
  // AI triage (advisory) — populated by the triage-maintenance edge function.
  ai_category: string | null
  ai_suggested_priority: MaintenancePriority | null
  ai_summary: string | null
  ai_recommendation: string | null
  ai_triaged_at: string | null
}
