import { Link } from 'react-router-dom'
import { Home, BookOpen } from 'lucide-react'
import { useSeo } from '../../lib/useSeo'

// Catch-all for any path App.tsx doesn't otherwise match (see the
// `path="*"` route nested under MarketingLayout). Under the current Vercel
// setup (root vercel.json rewrites `/((?!api/).*)` to `/index.html`), an
// unknown URL still gets served with a real HTTP 200 — there's no way for a
// pure client-side SPA rewrite to emit a true HTTP 404 status. This page is
// the pragmatic "soft 404": clear not-found content plus a forced `noindex`
// so Google (which does execute JS and will see this component render)
// treats the URL as not-indexable instead of quietly indexing junk paths.
//
// Can't use useRouteSeo()/getRouteSeo() (src/lib/useSeo.ts / src/seo/routes.mjs)
// here — the manifest throws for any path it doesn't recognize by design
// (a loud signal to register real routes), and a catch-all path must never
// be registered there anyway since that would pull it into the sitemap and
// prerender output. useSeo() directly, with an explicit noindex, is the
// documented escape hatch for exactly this case.
export default function NotFound() {
  useSeo({
    title: 'Page not found',
    description: `The page you're looking for doesn't exist or has moved.`,
    path: typeof window !== 'undefined' ? window.location.pathname : '/not-found',
    noindex: true,
  })

  return (
    <section className="max-w-2xl mx-auto px-5 lg:px-8 py-24 lg:py-32 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-3 text-3xl md:text-4xl font-bold text-ink tracking-tight">
        We couldn&rsquo;t find that page.
      </h1>
      <p className="mt-4 text-mute">
        The link might be broken, or the page may have moved. Here&rsquo;s how to get back on track.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-6 py-3 rounded-lg transition-colors"
        >
          <Home className="w-4 h-4" strokeWidth={2} />
          Back to home
        </Link>
        <Link
          to="/education"
          className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-brand-400 text-ink font-medium px-6 py-3 rounded-lg transition-colors"
        >
          <BookOpen className="w-4 h-4" strokeWidth={1.75} />
          Browse guides
        </Link>
      </div>
    </section>
  )
}
