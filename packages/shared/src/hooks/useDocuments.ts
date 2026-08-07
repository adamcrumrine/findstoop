import { useForegroundRefresh } from './useForegroundRefresh'
import { useState, useEffect, useCallback } from 'react'
import {
  getDocumentsByLease,
  getDocumentsByLeases,
  uploadDocument,
  deleteDocument,
  getSignedUrl,
} from '../api/documents'
import { supabase } from '../lib/supabase'
import type { Document, DocumentType } from '../types/document'

// ── Tenant: single lease ──────────────────────────────────────────────────────

interface UseTenantDocumentsResult {
  documents: Document[]
  loading: boolean
  error: string | null
  getDownloadUrl: (doc: Document) => Promise<string>
}

export function useTenantDocuments(leaseId: string | null): UseTenantDocumentsResult {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!leaseId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const data = await getDocumentsByLease(leaseId)
      setDocuments(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [leaseId])

  useEffect(() => { load() }, [load])
  useForegroundRefresh(load)

  const getDownloadUrl = (doc: Document) => getSignedUrl(doc.storage_url)

  return { documents, loading, error, getDownloadUrl }
}

// ── Manager: multiple leases ──────────────────────────────────────────────────

interface UseManagerDocumentsResult {
  documents: Document[]
  loading: boolean
  error: string | null
  uploading: boolean
  upload: (file: File, leaseId: string, uploadedBy: string, name: string, type: DocumentType) => Promise<void>
  remove: (doc: Document) => Promise<void>
  getDownloadUrl: (doc: Document) => Promise<string>
  reload: () => void
}

export function useManagerDocuments(leaseIds: string[]): UseManagerDocumentsResult {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getDocumentsByLeases(leaseIds)
      setDocuments(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [leaseIds.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])
  useForegroundRefresh(load)

  const upload = async (
    file: File,
    leaseId: string,
    uploadedBy: string,
    name: string,
    type: DocumentType
  ) => {
    setUploading(true)
    try {
      const doc = await uploadDocument(file, leaseId, uploadedBy, name, type)
      setDocuments((prev) => [doc, ...prev])
      // Tell everyone on the lease. Uploading used to be silent: the tenant
      // got a badge dot the next time they happened to open the app, and
      // nothing at all if they didn't.
      //
      // Deliberately not awaited into the failure path — the file is already
      // stored and the row already written, so a push service or mail provider
      // having a bad minute must not surface to the landlord as a failed
      // upload it would be wrong to retry.
      void supabase.functions
        .invoke('notify-tenant-document-uploaded', { body: { document_id: doc.id } })
        .catch(() => { /* fail-soft — the document is safe either way */ })
    } finally {
      setUploading(false)
    }
  }

  const remove = async (doc: Document) => {
    await deleteDocument(doc)
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
  }

  const getDownloadUrl = (doc: Document) => getSignedUrl(doc.storage_url)

  return { documents, loading, error, uploading, upload, remove, getDownloadUrl, reload: load }
}
