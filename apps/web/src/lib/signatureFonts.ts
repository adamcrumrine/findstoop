// The handwriting fonts used for typed signatures.
//
// These used to be a <link> in index.html, which made every page — the
// landing page, every dashboard — wait on a Google Fonts round trip (~800 ms
// on a mid-range phone) for fonts that only the signing flow and inspection
// PDFs ever draw. They're now loaded on demand by those two surfaces.

const HREF =
  'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&family=Great+Vibes&family=Sacramento&family=Caveat:wght@600&display=swap'

// Specs document.fonts.load needs to fetch each face. Weight must match the
// stylesheet, or the browser resolves a face that was never requested.
const FACES = [
  '600 16px "Dancing Script"',
  '16px "Great Vibes"',
  '16px "Sacramento"',
  '600 16px "Caveat"',
]

let ready: Promise<void> | null = null

/**
 * Inject the stylesheet (once) and resolve when every face has downloaded.
 *
 * Callers that only display text in these fonts can ignore the promise —
 * display=swap shows a fallback until they arrive. Callers that rasterize
 * text onto a canvas must await it: a canvas draws with whatever font is
 * loaded at that instant and never repaints.
 */
export function loadSignatureFonts(): Promise<void> {
  if (ready) return ready
  if (typeof document === 'undefined') return Promise.resolve()

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = HREF
  const sheetLoaded = new Promise<void>((resolve) => {
    link.onload = () => resolve()
    // A blocked or offline font CDN must not hang signing — fall back to
    // the cursive system font rather than wait forever.
    link.onerror = () => resolve()
  })
  document.head.appendChild(link)

  ready = sheetLoaded
    .then(() => Promise.all(FACES.map((f) => document.fonts.load(f).catch(() => []))))
    .then(() => undefined)
  return ready
}
