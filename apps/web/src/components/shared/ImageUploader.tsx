// Reusable file → Supabase storage → public URL uploader.
// Used for avatars, company logos, property thumbnails.

import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Camera, Loader2, Trash2, ImageIcon } from 'lucide-react'
import toast from 'react-hot-toast'

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
}

const BUCKET = 'user-uploads'

export default function ImageUploader({
  currentUrl,
  onChange,
  pathPrefix,
  variant = 'circle',
  size = 80,
  label,
  className = '',
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const radiusClass = variant === 'circle' ? 'rounded-full' : 'rounded-xl'

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB')
      return
    }
    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${pathPrefix}-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type,
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
        <p className="text-[11px] text-mute mt-1.5">PNG or JPG, up to 5 MB.</p>
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
