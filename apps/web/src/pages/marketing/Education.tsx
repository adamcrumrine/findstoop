import { Link } from 'react-router-dom'
import {
  BookOpen, ArrowRight, ShieldCheck, ClipboardList, FileText,
  ClipboardCheck, Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useSeo } from '../../lib/useSeo'

interface Article {
  to: string
  category: string
  title: string
  blurb: string
  readMinutes: number
  Icon: LucideIcon
  status: 'live' | 'soon'
}

// Listed in priority order — most useful first. New articles get added here.
// "soon" entries are always at the bottom.
const articles: Article[] = [
  {
    to: '/education/how-to-screen-tenants',
    category: 'Screening',
    title: 'How to screen tenants in 2026 — a complete guide for small landlords',
    blurb: 'The five-step screening flow, what you can and cannot ask, the income verification playbook (no more Truework waits), and where AI fits.',
    readMinutes: 9,
    Icon: ShieldCheck,
    status: 'live',
  },
  {
    to: '/education/fair-housing-act-guide',
    category: 'Compliance',
    title: 'Fair Housing Act — a small landlord\'s compliance guide for 2026',
    blurb: 'The seven federal protected classes, the state-by-state additions that catch landlords off-guard (especially source-of-income), advertising rules, and reasonable accommodations.',
    readMinutes: 11,
    Icon: ClipboardList,
    status: 'live',
  },
  {
    to: '/education/lead-based-paint-disclosure',
    category: 'Compliance',
    title: 'Federal lead-based paint disclosure for pre-1978 rentals',
    blurb: 'What 24 CFR 35.92 actually requires, the lead warning statement verbatim, the EPA pamphlet, and how the wrong workflow becomes a six-figure fine.',
    readMinutes: 8,
    Icon: FileText,
    status: 'live',
  },
  {
    to: '/education/move-in-checklist-guide',
    category: 'Operations',
    title: 'Move-in & move-out checklists — the deposit-saving guide',
    blurb: 'How to document unit condition properly, what state laws require, and how a good checklist becomes the only thing standing between you and a small-claims judgment.',
    readMinutes: 9,
    Icon: ClipboardCheck,
    status: 'live',
  },
  // ── Coming soon (always last) ───────────────────────────────────────────
  {
    to: '#',
    category: 'Operations',
    title: 'Writing a rental listing that fills in days, not months',
    blurb: 'Headline, photos, pricing strategy, and the Fair-Housing-safe phrasing that doesn\'t scare away the candidates you actually want.',
    readMinutes: 7,
    Icon: BookOpen,
    status: 'soon',
  },
  {
    to: '#',
    category: 'Taxes',
    title: 'Schedule E for the rest of us — a landlord tax primer',
    blurb: 'What you can deduct, what depreciation actually is, why the home-office deduction usually isn\'t worth it for landlords, and the records to keep.',
    readMinutes: 10,
    Icon: BookOpen,
    status: 'soon',
  },
  {
    to: '#',
    category: 'Operations',
    title: 'Rent collection — ACH vs card vs check, ranked by pain',
    blurb: 'The real cost (and risk) of each payment method, late-fee laws by state, and how to set rules that don\'t make you the bad guy.',
    readMinutes: 6,
    Icon: BookOpen,
    status: 'soon',
  },
]

export default function Education() {
  useSeo({
    title: 'Education — practical guides for small landlords',
    description: 'Practical, jargon-free guides for landlords who own one rental, ten rentals, or are thinking about buying their first one. Tenant screening, Fair Housing compliance, lead-paint disclosure, move-in checklists, and more.',
    path: '/education',
  })

  const live = articles.filter((a) => a.status === 'live')
  const soon = articles.filter((a) => a.status === 'soon')

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50/60 to-white">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 pt-20 pb-12">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-100 px-3 py-1.5 rounded-full mb-5">
                <BookOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
                Stoop Education
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-ink tracking-tight">
                Landlord school, without the school part.
              </h1>
              <p className="mt-5 text-lg text-mute">
                Practical, jargon-free guides for people who own one rental, ten rentals, or are thinking
                about buying their first one. The field manual we wish we had when we started.
              </p>
            </div>
            <div>
              <img
                src="/illustrations/education.png"
                alt=""
                className="w-full max-w-md mx-auto h-auto"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Live articles */}
      <section className="py-12">
        <div className="max-w-5xl mx-auto px-5 lg:px-8">
          <h2 className="text-xl font-bold text-ink mb-6">Read now</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {live.map((a) => (
              <ArticleCard key={a.to} article={a} />
            ))}
          </div>
        </div>
      </section>

      {/* Coming soon */}
      {soon.length > 0 && (
        <section className="py-12 bg-gradient-to-b from-white to-brand-50/30">
          <div className="max-w-5xl mx-auto px-5 lg:px-8">
            <h2 className="text-xl font-bold text-ink mb-2">Coming soon</h2>
            <p className="text-sm text-mute mb-6">
              The next batch — sign up and we'll email when they land.
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              {soon.map((a) => (
                <article key={a.title} className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 text-mute inline-flex items-center justify-center shrink-0">
                      <a.Icon className="w-5 h-5" strokeWidth={1.75} />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-mute font-bold">{a.category}</p>
                      <p className="font-semibold text-ink mt-0.5 text-sm leading-snug">{a.title}</p>
                      <p className="text-xs text-mute mt-1.5 leading-relaxed">{a.blurb}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-8 bg-white rounded-2xl border border-gray-200 p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-brand-50 rounded-xl flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-brand-600" strokeWidth={1.75} />
              </div>
              <h3 className="text-base font-semibold text-ink">Be the first to read each one</h3>
              <p className="text-sm text-mute mt-2 max-w-md mx-auto">
                Sign up — we'll let you know when new guides land, and you'll have a working landlord
                dashboard waiting.
              </p>
              <Link
                to="/register"
                className="mt-4 inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg transition-colors text-sm"
              >
                Create a landlord account
                <ArrowRight className="w-4 h-4" strokeWidth={2} />
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  )
}

function ArticleCard({ article }: { article: Article }) {
  return (
    <Link
      to={article.to}
      className="group block bg-white rounded-2xl border border-gray-200 p-5 hover:border-brand-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
          <article.Icon className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[10px] uppercase tracking-wider text-brand-700 font-bold">{article.category}</p>
            <p className="text-[10px] text-mute">{article.readMinutes} min</p>
          </div>
          <h3 className="font-semibold text-ink leading-snug group-hover:text-brand-700">
            {article.title}
          </h3>
          <p className="text-sm text-mute mt-2 leading-relaxed">{article.blurb}</p>
          <p className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 group-hover:text-brand-800">
            Read article
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
          </p>
        </div>
      </div>
    </Link>
  )
}
