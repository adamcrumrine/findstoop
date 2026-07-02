import { useState } from 'react'
import { BRAND } from '../../lib/brand'
import { applyLandlordBrand, clearLandlordBrand, isValidBrandHex } from '../../lib/landlordBrand'

// Static class strings — Tailwind can't see dynamically-built class names.
const STEPS: Array<[string, string]> = [
  ['50', 'bg-brand-50'], ['100', 'bg-brand-100'], ['200', 'bg-brand-200'],
  ['300', 'bg-brand-300'], ['400', 'bg-brand-400'], ['500', 'bg-brand-500'],
  ['600', 'bg-brand-600'], ['700', 'bg-brand-700'], ['800', 'bg-brand-800'],
  ['900', 'bg-brand-900'],
]

// Dev-only QA page (see App.tsx): renders the active brand's palette and the
// core UI treatments so a new brand — or a landlord accent color — can be
// eyeballed in one place. Not routed in production builds.
export default function BrandPreview() {
  const [hex, setHex] = useState('')

  const tryColor = (value: string) => {
    setHex(value)
    if (isValidBrandHex(value)) applyLandlordBrand(value)
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Brand preview</h1>
          <p className="text-sm text-mute">
            Active brand: <span className="font-medium">{BRAND.name}</span> ({BRAND.id}, {BRAND.experience})
          </p>
        </div>
        <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-12 w-auto" />
      </header>

      <section>
        <h2 className="font-semibold text-ink mb-3">Palette</h2>
        <div className="grid grid-cols-10 gap-1.5">
          {STEPS.map(([step, cls]) => (
            <div key={step} className="text-center">
              <div className={`h-14 rounded-lg border border-black/5 ${cls}`} />
              <span className="text-[10px] text-mute">{step}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 h-14 rounded-lg bg-brand-gradient" />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-ink">Core treatments</h2>
        <div className="flex flex-wrap items-center gap-4">
          <button className="text-white bg-brand-500 hover:bg-brand-600 font-medium px-5 py-2.5 rounded-lg">
            Primary button
          </button>
          <button className="text-brand-600 border border-brand-200 font-medium px-5 py-2.5 rounded-lg">
            Secondary button
          </button>
          <a href="#top" className="text-brand-600 font-medium hover:underline">Text link</a>
          <span className="text-xs font-medium bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full">Badge</span>
        </div>
        <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 text-sm text-ink max-w-md">
          Tinted panel with <span className="text-brand-600 font-medium">accent text</span> — the most common
          card treatment across the app.
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-ink mb-2">Try a landlord accent color</h2>
        <p className="text-sm text-mute mb-3">
          Simulates what tenants see when a landlord sets a custom color — the ramp is derived and
          auto-darkened to keep buttons/links WCAG AA.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={isValidBrandHex(hex) ? hex : '#888888'}
            onChange={(e) => tryColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded border border-gray-200"
          />
          <input
            type="text"
            value={hex}
            onChange={(e) => tryColor(e.target.value)}
            placeholder="#7A1F1F"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-32"
          />
          <button
            type="button"
            onClick={() => { setHex(''); clearLandlordBrand() }}
            className="text-sm text-mute hover:text-ink underline"
          >
            Reset to {BRAND.name}
          </button>
        </div>
      </section>
    </div>
  )
}
