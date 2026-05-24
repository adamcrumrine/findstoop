// Client-side file validation. Browser-reported MIME types are trivially
// spoofable — anyone can rename evil.html to evil.jpg and claim
// image/jpeg. We verify the first few bytes ("magic numbers") match a
// known format before accepting any upload.

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/heic'
export type DocMime   = ImageMime | 'application/pdf'

/**
 * Returns the verified MIME if the file's bytes match a known image format,
 * or null if they don't.
 */
export async function verifyImageMagicBytes(file: File | Blob): Promise<ImageMime | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())

  if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) return 'image/jpeg'
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) return 'image/png'
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38) return 'image/gif'
  if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return 'image/webp'
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11])
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heic'
  }
  return null
}

/** Same as above but also accepts PDFs — for screening-doc uploads. */
export async function verifyDocMagicBytes(file: File | Blob): Promise<DocMime | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  // PDF: %PDF (25 50 44 46)
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return 'application/pdf'
  return verifyImageMagicBytes(file)
}
