export type DocumentType = 'lease' | 'addendum' | 'inspection' | 'notice' | 'other'

export interface Document {
  id: string
  lease_id: string
  uploaded_by: string
  name: string
  type: DocumentType
  storage_url: string
  created_at: string
}
