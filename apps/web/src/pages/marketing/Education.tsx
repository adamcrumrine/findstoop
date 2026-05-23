import { Link } from 'react-router-dom'
import { BookOpen, ArrowRight, Sparkles, ClipboardList, ShieldCheck, FileSignature, BarChart3 } from 'lucide-react'
import { useSeo } from '../../lib/useSeo'

const upcomingTopics = [
  { Icon: ClipboardList, title: 'Writing a rental listing that fills in days, not months' },
  { Icon: ShieldCheck,   title: "What to actually look at in a tenant's screening report" },
  { Icon: FileSignature, title: 'State-by-state quirks every landlord should know about leases' },
  { Icon: BarChart3,     title: 'Schedule E for the rest of us: a landlord tax primer' },
]

export default function Education() {
  useSeo({
    title: 'Education — landlord school without the school part',
    description: 'Practical, jargon-free guides for landlords who own one rental, ten rentals, or are thinking about buying their first one. The field manual we wish we had when we started.',
    path: '/education',
  })
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50/60 to-white">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 pt-20 pb-12">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-100 px-3 py-1.5 rounded-full mb-5">
                <BookOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
                FindStoop Education
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-ink tracking-tight">
                Landlord school, without the school part.
              </h1>
              <p className="mt-5 text-lg text-mute">
                Practical, jargon-free guides for people who own one rental, ten
                rentals, or are thinking about buying their first one. We're
                writing the field manual we wish we had when we started.
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

      {/* Coming soon */}
      <section className="py-12">
        <div className="max-w-3xl mx-auto px-5 lg:px-8">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <div className="w-14 h-14 mx-auto mb-4 bg-brand-50 rounded-2xl flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-brand-600" strokeWidth={1.75} />
            </div>
            <h2 className="text-lg font-semibold text-ink">The first articles are on the way</h2>
            <p className="text-sm text-mute mt-2 max-w-md mx-auto">
              We're starting with the topics landlords ask us about most. Drop
              your email when you sign up and we'll let you know when the first
              guide lands.
            </p>
            <Link
              to="/register"
              className="mt-5 inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              Sign up to get notified
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </section>

      {/* Upcoming topics */}
      <section className="py-16">
        <div className="max-w-5xl mx-auto px-5 lg:px-8">
          <h2 className="text-xl font-semibold text-ink mb-6">What we're working on</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {upcomingTopics.map(({ Icon, title }) => (
              <article key={title} className="flex items-start gap-3 bg-white rounded-2xl border border-gray-100 p-5">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="font-medium text-ink">{title}</p>
                  <p className="text-xs text-mute mt-1">Article — coming soon</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
