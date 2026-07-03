// Tamper-evident inspection photos — pure helpers (no Supabase imports, so
// this module is unit-testable in the node vitest environment).
//
// When an inspection photo is uploaded we compute the SHA-256 of the exact
// file bytes (Web Crypto — no dependencies) and store it in
// inspection_photo_hashes with a server-stamped timestamp. Later — in the UI,
// or when generating the court-ready PDF — we re-hash the stored file and
// compare. A match proves the photo is byte-for-byte identical to what was
// uploaded on the recorded date; a mismatch means the file changed.
//
// Photos uploaded before this feature have no hash row. They are simply
// "unverified" — we never claim an attestation we don't have.

export interface PhotoHashRecord {
  storage_path: string
  /** Lowercase hex SHA-256 of the uploaded file bytes. */
  content_hash: string
  /** Server-stamped (DB trigger) — the uploader cannot backdate it. */
  hash_recorded_at: string
}

export type PhotoVerifyResult = 'verified' | 'mismatch'

/** SHA-256 of a blob/buffer as lowercase hex, via Web Crypto. */
export async function sha256Hex(data: Blob | ArrayBuffer): Promise<string> {
  const buf = data instanceof ArrayBuffer ? data : await data.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Re-hash fetched bytes and compare against the stored fingerprint. */
export async function verifyBytesAgainstRecord(
  bytes: Blob | ArrayBuffer,
  record: PhotoHashRecord,
): Promise<PhotoVerifyResult> {
  const hash = await sha256Hex(bytes)
  return hash === record.content_hash.toLowerCase() ? 'verified' : 'mismatch'
}

/** "Jun 3, 2026" — for the inline verification badge. */
export function capturedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' })
}

/** "Jun 3, 2026, 2:14 PM" — for the PDF stamp, where the time matters. */
export function capturedDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
