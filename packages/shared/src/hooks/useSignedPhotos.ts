import { useEffect, useState } from 'react'
import { signMaintenancePhotos } from '../api/maintenance'

/**
 * Resolve stored maintenance-photo paths to signed URLs for rendering.
 *
 * The bucket is private, so an <img src> pointing at a raw path renders
 * nothing. Signing is async and per-view, which is the point: access is
 * re-checked on every render rather than baked into a permanent link.
 *
 * Returns [] until the URLs arrive; callers already guard on length, so a
 * thumbnail strip simply appears a moment later rather than flashing broken
 * image icons.
 */
export function useSignedPhotos(paths: string[] | null | undefined): string[] {
  const [urls, setUrls] = useState<string[]>([])
  // Join, so a new array of the same paths doesn't re-sign on every render.
  const key = (paths ?? []).join('|')

  useEffect(() => {
    if (!key) { setUrls([]); return }
    let cancelled = false
    void signMaintenancePhotos(key.split('|')).then((signed) => {
      if (!cancelled) setUrls(signed)
    })
    return () => { cancelled = true }
  }, [key])

  return urls
}
