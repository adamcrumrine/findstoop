import { ShieldCheck, Sparkles } from 'lucide-react'

export default function Screening() {
  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Screening</h1>
        <p className="text-sm text-mute mt-1">
          Order credit, background, and eviction history reports on applicants.
        </p>
      </header>

      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <div className="w-14 h-14 mx-auto mb-4 bg-brand-50 rounded-2xl flex items-center justify-center">
          <ShieldCheck className="w-7 h-7 text-brand-600" strokeWidth={1.75} />
        </div>
        <h2 className="text-lg font-semibold text-ink">Screening coming soon</h2>
        <p className="text-sm text-mute mt-2 max-w-md mx-auto">
          Applicants pay for their own credit and background checks. Reports
          come back in minutes and stay attached to their application — no
          paperwork, no separate logins.
        </p>
        <div className="inline-flex items-center gap-1.5 text-xs text-brand-700 font-medium mt-4 bg-brand-50 px-3 py-1.5 rounded-full">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
          In active development
        </div>
      </div>
    </div>
  )
}
