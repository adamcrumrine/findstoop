import { describe, expect, it } from 'vitest'
import { sha256Hex, verifyBytesAgainstRecord, type PhotoHashRecord } from './photoIntegrity'

const bytes = (s: string): ArrayBuffer => {
  const u8 = new TextEncoder().encode(s)
  return u8.buffer.slice(0, u8.byteLength) as ArrayBuffer
}

// FIPS 180-4 known-answer vectors — if these hold, the fingerprint we store
// is a real SHA-256 that any third party (or a court's expert) can reproduce
// with standard tools (e.g. `sha256sum` on the downloaded file).
describe('sha256Hex', () => {
  it('matches the empty-input test vector', async () => {
    expect(await sha256Hex(bytes(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('matches the "abc" test vector', async () => {
    expect(await sha256Hex(bytes('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('hashes Blobs identically to their raw bytes', async () => {
    const raw = bytes('inspection photo bytes')
    expect(await sha256Hex(new Blob([raw]))).toBe(await sha256Hex(raw))
  })
})

describe('verifyBytesAgainstRecord', () => {
  const record = (hash: string): PhotoHashRecord => ({
    storage_path: 'lease/insp/kitchen_stove-1.jpg',
    content_hash: hash,
    hash_recorded_at: '2026-07-02T12:00:00Z',
  })

  it('verifies when the bytes match the stored fingerprint', async () => {
    const hash = await sha256Hex(bytes('original photo'))
    expect(await verifyBytesAgainstRecord(bytes('original photo'), record(hash))).toBe('verified')
  })

  it('flags a mismatch when even one byte differs', async () => {
    const hash = await sha256Hex(bytes('original photo'))
    expect(await verifyBytesAgainstRecord(bytes('original photo.'), record(hash))).toBe('mismatch')
  })

  it('is case-insensitive on the stored hash', async () => {
    const hash = (await sha256Hex(bytes('x'))).toUpperCase()
    expect(await verifyBytesAgainstRecord(bytes('x'), record(hash))).toBe('verified')
  })
})
