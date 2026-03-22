import { supabase } from '../lib/supabase'
import type { Document, DocumentType } from '../types/document'

export async function getDocumentsByLease(leaseId: string): Promise<Document[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('lease_id', leaseId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getDocumentsByLeases(leaseIds: string[]): Promise<Document[]> {
  if (leaseIds.length === 0) return []
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .in('lease_id', leaseIds)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function uploadDocument(
  file: File,
  leaseId: string,
  uploadedBy: string,
  name: string,
  type: DocumentType
): Promise<Document> {
  const ext = file.name.split('.').pop()
  const path = `${leaseId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('lease-documents')
    .upload(path, file)
  if (uploadErr) throw new Error(uploadErr.message)

  const { data, error } = await supabase
    .from('documents')
    .insert({ lease_id: leaseId, uploaded_by: uploadedBy, name, type, storage_url: path })
    .select()
    .single()
  if (error) {
    // Clean up orphaned file
    await supabase.storage.from('lease-documents').remove([path])
    throw new Error(error.message)
  }
  return data
}

export async function deleteDocument(doc: Document): Promise<void> {
  const { error: dbErr } = await supabase.from('documents').delete().eq('id', doc.id)
  if (dbErr) throw new Error(dbErr.message)
  await supabase.storage.from('lease-documents').remove([doc.storage_url])
}

export async function getSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from('lease-documents')
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
