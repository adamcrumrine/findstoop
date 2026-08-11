// Renders maintenance photos from stored storage PATHS.
//
// A component rather than a bare hook because the card-level strip renders
// inside a .map() over requests, where a hook can't be called. This keeps the
// signing in one place for every surface that shows these images.

import { useSignedPhotos } from '@findstoop/shared/hooks/useSignedPhotos'

interface Props {
  paths: string[] | null | undefined
  /** 'thumbs' — small row on a card. 'grid' — full, clickable, in a detail view. */
  variant?: 'thumbs' | 'grid'
  /** Cap for the thumbs row. */
  limit?: number
}

export default function MaintenancePhotos({ paths, variant = 'thumbs', limit = 3 }: Props) {
  const urls = useSignedPhotos(paths)
  if (urls.length === 0) return null

  if (variant === 'thumbs') {
    return (
      <div className="flex gap-1.5 mt-2">
        {urls.slice(0, limit).map((url, i) => (
          <img key={i} src={url} alt="" loading="lazy" decoding="async"
               className="w-10 h-10 rounded-lg object-cover" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {urls.map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt="" loading="lazy" decoding="async"
               className="w-full aspect-square rounded-lg object-cover" />
        </a>
      ))}
    </div>
  )
}
