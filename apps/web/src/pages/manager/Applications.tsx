import { ClipboardList, Sparkles } from 'lucide-react'

export default function Applications() {
  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Applications</h1>
        <p className="text-sm text-mute mt-1">
          Review prospective renters who've applied to your units.
        </p>
      </header>

      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <div className="w-14 h-14 mx-auto mb-4 bg-brand-50 rounded-2xl flex items-center justify-center">
          <ClipboardList className="w-7 h-7 text-brand-600" strokeWidth={1.75} />
        </div>
        <h2 className="text-lg font-semibold text-ink">Applications coming soon</h2>
        <p className="text-sm text-mute mt-2 max-w-md mx-auto">
          Prospective renters fill out one standardized application that
          links to their screening report. You'll see income, employment,
          and rental history in one place.
        </p>
        <div className="inline-flex items-center gap-1.5 text-xs text-brand-700 font-medium mt-4 bg-brand-50 px-3 py-1.5 rounded-full">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
          In active development
        </div>
      </div>
    </div>
  )
}
