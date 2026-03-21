export interface Message {
  id: string
  sender_id: string
  recipient_id: string
  lease_id: string
  body: string
  read_at: string | null
  created_at: string
}
