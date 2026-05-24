// Reusable file → Supabase storage → public URL uploader.
// Used for avatars, company logos, property thumbnails.

import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Camera, Loader2, Trash2, ImageIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { verifyImageMagicBytes } from '../../lib/fileValidation'

interface ImageUploaderProps {
  currentUrl: string | null | undefined
  /** Callback after upload succeeds with the new public URL. Also called with null when cleared. */
  onChange: (url: string | null) => void | Promise<void>
  /** Subfolder + base filename (e.g. `avatars/{userId}` or `property-thumbnails/{propertyId}`). A timestamp is appended for cache-busting. */
  pathPrefix: string
  /** 'circle' for avatars, 'square' for thumbnails / logos. */
  variant?: 'circle' | 'square'
  /** Display size in pixels — square dimensions. */
  size?: number
  label?: string
  className?: string
  /**
   * Client-side resize cap (longest edge, px) applied before upload.
   * Default 512 keeps files tiny but stays crisp on retina for any display
   * up to ~256px on screen. Set to 0 to skip resizing entirely.
   */
  maxOutputDimension?: number
}

const BUCKET = 'user-uploads'

/**
 * Resize an image client-side via canvas to keep storage small and rendering
 * crisp. Returns a JPEG blob at the requested max-dimension (longest edge),
 * preserving aspect ratio. Pass 0 for maxDim to return the file as-is.
 */
async function resizeImage(file: File, maxDim: number, quality = 0.9): Promise<Blob> {
  if (maxDim <= 0) return file
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = bitmap
    if (width <= maxDim && height <= maxDim) {
      // Already small enough — but re-encode as JPEG to strip metadata + recompress.
      // Skip for tiny files (<200 KB) where re-encoding gains little.
      if (file.size < 200_000) return file
    }
    const scale = Math.min(1, maxDim / Math.max(width, height))
    const outW = Math.round(width * scale)
    const outH = Math.round(height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // Sharper downscale than the default — disable smoothing for the final pass
    // to avoid the over-soft look browsers produce on big downscales.
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, outW, outH)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas conversion failed'))),
        'image/jpeg',
        quality,
      )
    })
  } finally {
    bitmap.close()
  }
}

export default function ImageUploader({
  currentUrl,
  onChange,
  pathPrefix,
  variant = 'circle',
  size = 80,
  label,
  className = '',
  maxOutputDimension = 512,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const radiusClass = variant === 'circle' ? 'rounded-full' : 'rounded-xl'

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10 MB')
      return
    }
    // Verify the bytes actually match an image format — the browser-reported
    // MIME type is trivially spoofable (rename evil.html to evil.jpg, claim
    // image/jpeg, browser believes it). Magic-byte check stops that.
    const verifiedMime = await verifyImageMagicBytes(file)
    if (!verifiedMime) {
      toast.error('That file doesn\'t look like a real image (JPEG, PNG, GIF, WebP, or HEIC).')
      return
    }
    setUploading(true)
    try {
      // Client-side downscale before upload. Keeps storage tiny (~30–80 KB
      // typical) and the rendered image crisp on retina at our display sizes.
      const resized = await resizeImage(file, maxOutputDimension)
      const ext = resized.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${pathPrefix}-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, resized, {
        upsert: true,
        contentType: resized.type || file.type,
      })
      if (error) throw error
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
      await onChange(data.publicUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleClear = async () => {
    if (!currentUrl) return
    await onChange(null)
  }

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div
        className={`relative shrink-0 ${radiusClass} bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center`}
        style={{ width: size, height: size }}
      >
        {currentUrl ? (
          <img src={currentUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-6 h-6 text-mute-400" strokeWidth={1.5} />
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-white animate-spin" strokeWidth={1.75} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {label && <p className="text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">{label}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink bg-white border border-gray-300 hover:border-brand-400 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
          >
            <Camera className="w-3.5 h-3.5" strokeWidth={1.75} />
            {currentUrl ? 'Change' : 'Upload'}
          </button>
          {currentUrl && (
            <button
              type="button"
              onClick={handleClear}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
              Remove
            </button>
          )}
        </div>
        <p className="text-[11px] text-mute mt-1.5">PNG or JPG, up to 10 MB. We resize automatically.</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  )
}
