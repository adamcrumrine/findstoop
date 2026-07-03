// On-demand verification badge for a tamper-evident inspection photo.
//
// Renders nothing for legacy photos (no hash on file — we make no claim
// either way). For photos with a recorded fingerprint, shows a small
// "Verify" affordance; clicking it downloads the stored file, re-hashes it
// (SHA-256, Web Crypto), and compares against the fingerprint recorded at
// upload. Verification is deliberately lazy — we never hash every thumbnail
// eagerly, only when someone asks.

import { useState } from 'react'
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { capturedDate, type PhotoHashRecord } from '../../lib/photoIntegrity'
import { verifyStoredPhoto } from '../../lib/photoIntegrityStore'

type Status = 'idle' | 'checking' | 'verified' | 'mismatch' | 'error'

export default function PhotoVerifyBadge({ record, className = '' }: {
  record?: PhotoHashRecord
  className?: string
}) {
  const [status, setStatus] = useState<Status>('idle')

  // Legacy photo — uploaded before fingerprinting existed. No badge.
  if (!record) return null

  const run = async () => {
    setStatus('checking')
    setStatus(await verifyStoredPhoto(record))
  }

  const base = `inline-flex items-start gap-1 text-[10px] leading-tight font-medium px-1.5 py-0.5 rounded-md border max-w-[10rem] text-left ${className}`

  if (status === 'checking') {
    return (
      <span className={`${base} bg-white text-mute border-gray-200`}>
        <Loader2 className="w-3 h-3 shrink-0 animate-spin mt-px" strokeWidth={2} />
        Checking…
      </span>
    )
  }
  if (status === 'verified') {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200`}>
        <ShieldCheck className="w-3 h-3 shrink-0 mt-px" strokeWidth={2} />
        Verified — captured {capturedDate(record.hash_recorded_at)}, unaltered
      </span>
    )
  }
  if (status === 'mismatch') {
    return (
      <span className={`${base} bg-red-50 text-red-700 border-red-200`}>
        <ShieldAlert className="w-3 h-3 shrink-0 mt-px" strokeWidth={2} />
        Does not match the original — file may have been altered
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={run}
      title={`A fingerprint of this photo was recorded ${capturedDate(record.hash_recorded_at)}. Click to re-check the file against it.`}
      className={`${base} bg-white text-mute border-gray-200 hover:border-gray-400 hover:text-ink`}
    >
      <ShieldCheck className="w-3 h-3 shrink-0 mt-px" strokeWidth={2} />
      {status === 'error' ? 'Couldn’t verify — retry' : 'Verify'}
    </button>
  )
}
