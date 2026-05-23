import { Megaphone, Sparkles } from 'lucide-react'

export default function Listings() {
  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Listings</h1>
        <p className="text-sm text-mute mt-1">
          Post your vacant units publicly and accept online applications.
        </p>
      </header>

      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <div className="w-14 h-14 mx-auto mb-4 bg-brand-50 rounded-2xl flex items-center justify-center">
          <Megaphone className="w-7 h-7 text-brand-600" strokeWidth={1.75} />
        </div>
        <h2 className="text-lg font-semibold text-ink">Listings coming soon</h2>
        <p className="text-sm text-mute mt-2 max-w-md mx-auto">
          Soon you'll be able to publish a vacant unit to a shareable listing page,
          collect applications, and syndicate to major rental sites — all from here.
        </p>
        <div className="inline-flex items-center gap-1.5 text-xs text-brand-700 font-medium mt-4 bg-brand-50 px-3 py-1.5 rounded-full">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
          In active development
        </div>
      </div>
    </div>
  )
}
