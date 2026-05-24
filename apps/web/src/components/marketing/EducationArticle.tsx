// Shared layout for Education articles. Keeps consistent semantic HTML
// (article > header > section), reading-width column, and a tail CTA back
// into the product so each article ends with a natural conversion path.

import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Clock, BookOpen } from 'lucide-react'

interface EducationArticleProps {
  category: string                    // e.g. "Screening", "Compliance"
  title: string
  subtitle?: string
  readMinutes: number
  publishedOn?: string                // ISO date — defaults to "Updated 2026"
  children: React.ReactNode
  relatedLinks?: { to: string; label: string }[]
}

export default function EducationArticle({
  category, title, subtitle, readMinutes, publishedOn, children, relatedLinks,
}: EducationArticleProps) {
  const dateLabel = publishedOn
    ? new Date(publishedOn).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Updated for 2026'

  return (
    <article className="max-w-3xl mx-auto px-5 lg:px-8 py-12 md:py-16">
      <Link to="/education" className="inline-flex items-center gap-1.5 text-sm font-medium text-mute hover:text-ink mb-6">
        <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        Back to Education
      </Link>

      <header className="border-b border-gray-200 pb-6 mb-8">
        <p className="text-xs uppercase tracking-wider text-brand-700 font-bold mb-2">{category}</p>
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-ink leading-tight tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 text-lg text-mute leading-relaxed">{subtitle}</p>
        )}
        <div className="mt-5 flex items-center gap-4 text-xs text-mute">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
            {readMinutes} min read
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
            {dateLabel}
          </span>
        </div>
      </header>

      {/* Body uses .article-body for typography defaults */}
      <div className="article-body text-ink leading-relaxed">
        {children}
      </div>

      {relatedLinks && relatedLinks.length > 0 && (
        <aside className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-xs uppercase tracking-wider text-mute font-bold mb-3">Related reading</p>
          <ul className="space-y-2">
            {relatedLinks.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="inline-flex items-center gap-1.5 text-brand-700 hover:text-brand-800 font-medium">
                  {l.label}
                  <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}

      {/* Standard tail CTA */}
      <aside className="mt-10 bg-gradient-to-br from-brand-50 to-white border border-brand-200 rounded-2xl p-6">
        <p className="text-sm uppercase tracking-wider text-brand-700 font-bold mb-1">Try FindStoop</p>
        <h3 className="text-xl font-bold text-ink">Everything in this article — automated.</h3>
        <p className="mt-2 text-sm text-mute">
          $9 per unit per month, every feature included. Applicants pay $5 for verified pre-qualification with a Tenability™ score.
        </p>
        <Link
          to="/register"
          className="mt-4 inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg transition-colors text-sm"
        >
          Create a landlord account
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </Link>
      </aside>

      <style>{`
        .article-body { font-size: 1.0625rem; line-height: 1.7; }
        .article-body h2 { font-size: 1.5rem; font-weight: 700; color: #3A3A3C; margin-top: 2.5rem; margin-bottom: 0.75rem; letter-spacing: -0.01em; }
        .article-body h3 { font-size: 1.125rem; font-weight: 600; color: #3A3A3C; margin-top: 2rem; margin-bottom: 0.5rem; }
        .article-body p { margin-bottom: 1rem; }
        .article-body ul, .article-body ol { margin-bottom: 1rem; padding-left: 1.5rem; }
        .article-body ul { list-style: disc; }
        .article-body ol { list-style: decimal; }
        .article-body li { margin-bottom: 0.5rem; }
        .article-body a { color: #006e62; text-decoration: underline; text-underline-offset: 2px; }
        .article-body a:hover { color: #005951; }
        .article-body strong { font-weight: 600; color: #3A3A3C; }
        .article-body blockquote {
          border-left: 3px solid #008275;
          padding: 0.75rem 1rem;
          background: #e6f9f6;
          margin: 1.5rem 0;
          border-radius: 0 0.5rem 0.5rem 0;
        }
        .article-body blockquote p { margin-bottom: 0; }
        .article-body .callout {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 0.75rem;
          padding: 1rem 1.25rem;
          margin: 1.5rem 0;
        }
        .article-body .callout strong { color: #92400e; }
        .article-body .faq { margin-top: 1.5rem; }
        .article-body .faq h3 { margin-top: 1.5rem; }
      `}</style>
    </article>
  )
}
