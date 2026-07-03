// Tamper-evident inspection photos — Supabase-backed side of the feature.
// (Pure hashing/compare helpers live in photoIntegrity.ts so they stay
// testable without a Supabase client.)

import { supabase } from './supabase'
import {
  sha256Hex, verifyBytesAgainstRecord,
  type PhotoHashRecord, type PhotoVerifyResult,
} from './photoIntegrity'

const BUCKET = 'inspection-photos'
const TABLE  = 'inspection_photo_hashes'
const SELECT = 'storage_path, content_hash, hash_recorded_at'

/**
 * Hash the uploaded file and record it in inspection_photo_hashes.
 * The DB stamps hash_recorded_at server-side (a trigger overwrites any
 * client value) and the row is immutable once written.
 *
 * Returns the stored record, or null if hashing/insert failed — the photo
 * upload itself should still succeed; the photo just stays "unverified"
 * like a legacy one.
 */
export async function recordInspectionPhotoHash(args: {
  leaseId: string
  inspectionId: string
  storagePath: string
  file: Blob
}): Promise<PhotoHashRecord | null> {
  try {
    const content_hash = await sha256Hex(args.file)
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        lease_id: args.leaseId,
        inspection_id: args.inspectionId,
        storage_path: args.storagePath,
        content_hash,
      })
      .select(SELECT)
      .single()
    if (error) return null
    return data as PhotoHashRecord
  } catch {
    return null
  }
}

/** Fetch hash records for a set of storage paths, keyed by path. */
export async function fetchPhotoHashRecords(paths: string[]): Promise<Record<string, PhotoHashRecord>> {
  const unique = Array.from(new Set(paths)).filter(Boolean)
  if (unique.length === 0) return {}
  const { data } = await supabase
    .from(TABLE)
    .select(SELECT)
    .in('storage_path', unique)
  const map: Record<string, PhotoHashRecord> = {}
  for (const row of (data ?? []) as PhotoHashRecord[]) map[row.storage_path] = row
  return map
}

/**
 * Download the stored file and re-hash it against the recorded fingerprint.
 * 'error' means we couldn't fetch the bytes (network / signed-URL failure) —
 * distinct from 'mismatch', which is a real integrity failure.
 */
export async function verifyStoredPhoto(record: PhotoHashRecord): Promise<PhotoVerifyResult | 'error'> {
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(record.storage_path, 300)
    if (!data?.signedUrl) return 'error'
    const res = await fetch(data.signedUrl)
    if (!res.ok) return 'error'
    return await verifyBytesAgainstRecord(await res.arrayBuffer(), record)
  } catch {
    return 'error'
  }
}
