// Admin Visitors map — where's traffic coming from?
//
// Reads admin_visitor_locations (one row per unique city). Plots a dot
// per location on a US map sized by visit count. Right pane shows the
// detail list sorted by recency, with filters by time range.
//
// Coordinates are IP-derived (city-level only) so this is privacy-safe —
// "Columbus, OH" describes ~thousands of people, never an individual.

import { useEffect, useMemo, useState } from 'react'
import { Loader2, MapPin, Globe, Clock } from 'lucide-react'
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps'
import { supabase } from '../../lib/supabase'

// US topojson hosted on the world-atlas CDN (free, public).
const US_TOPOJSON = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'

interface Location {
  country_code: string | null
  region:       string | null
  city:         string | null
  latitude:     number
  longitude:    number
  event_count:  number
  session_count: number
  unique_users: number
  page_views:   number
  sign_ups:     number
  last_visit_at: string
  first_visit_at: string
  top_pages:    string[] | null
}

type TimeRange = '1h' | '24h' | '7d' | '30d' | 'all'

function rangeFilter(range: TimeRange): string | null {
  const now = new Date()
  switch (range) {
    case '1h':  return new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    case '7d':  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    case 'all': return null
  }
}

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return `${Math.round(s)}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export default function AdminVisitors() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<TimeRange>('24h')
  const [selected, setSelected] = useState<Location | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const since = rangeFilter(range)
      let q = supabase.from('admin_visitor_locations').select('*')
      if (since) q = q.gte('last_visit_at', since)
      const { data } = await q.order('last_visit_at', { ascending: false }).limit(500)
      if (cancelled) return
      setLocations((data as Location[] | null) ?? [])
      setSelected(null)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [range])

  const maxCount = useMemo(
    () => locations.reduce((m, l) => Math.max(m, l.event_count), 1),
    [locations],
  )

  // Distinguish US visitors (rendered on the US map) from international
  // visitors (rendered as a small list to the right of the map).
  const usLocations = locations.filter((l) => l.country_code === 'US')
  const intlLocations = locations.filter((l) => l.country_code !== 'US')

  return (
    <div className="p-4 sm:p-6 max-w-7xl">
      <header className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Visitors</h1>
          <p className="text-sm text-slate-500 mt-1">
            Where traffic is coming from — IP-derived city-level resolution. Marketing pages + signed-in users.
          </p>
        </div>
        {/* Range toggle: full-width segmented row on mobile so the pills
            get real tap area; compact pill cluster on sm+. */}
        <div className="flex gap-1 sm:gap-1.5 bg-slate-100 sm:bg-transparent rounded-full p-1 sm:p-0 shrink-0">
          {(['1h', '24h', '7d', '30d', 'all'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                range === r ? 'bg-slate-900 text-white' : 'sm:bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi Icon={MapPin}  label="Unique locations" value={locations.length.toLocaleString()} />
        <Kpi Icon={Globe}   label="Sessions"         value={locations.reduce((s, l) => s + l.session_count, 0).toLocaleString()} />
        <Kpi Icon={MapPin}  label="Page views"       value={locations.reduce((s, l) => s + l.page_views,    0).toLocaleString()} />
        <Kpi Icon={MapPin}  label="Sign-ups"         value={locations.reduce((s, l) => s + l.sign_ups,      0).toLocaleString()} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-96 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
          {/* US map */}
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">United States — {usLocations.length} location{usLocations.length === 1 ? '' : 's'}</h2>
              {selected && (
                <button type="button" onClick={() => setSelected(null)} className="text-xs text-brand-600 hover:underline">Clear selection</button>
              )}
            </div>
            <div className="relative h-72 sm:h-96 lg:h-[480px]">
              <ComposableMap
                projection="geoAlbersUsa"
                projectionConfig={{ scale: 1000 }}
                width={800}
                height={480}
                style={{ width: '100%', height: '100%' }}
              >
                <ZoomableGroup>
                  <Geographies geography={US_TOPOJSON}>
                    {({ geographies }) =>
                      geographies.map((geo) => (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill="#f1f5f9"
                          stroke="#cbd5e1"
                          strokeWidth={0.5}
                          style={{
                            default: { outline: 'none' },
                            hover:   { outline: 'none', fill: '#e2e8f0' },
                            pressed: { outline: 'none' },
                          }}
                        />
                      ))
                    }
                  </Geographies>
                  {usLocations.map((loc, i) => {
                    const radius = Math.max(4, Math.min(18, 4 + (loc.event_count / maxCount) * 18))
                    const isSelected = selected === loc
                    return (
                      <Marker key={`${loc.city}-${loc.region}-${i}`} coordinates={[Number(loc.longitude), Number(loc.latitude)]}>
                        <circle
                          r={radius}
                          fill={isSelected ? '#0ea5e9' : 'rgba(14, 165, 233, 0.55)'}
                          stroke="#ffffff"
                          strokeWidth={1.5}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelected(loc)}
                        />
                      </Marker>
                    )
                  })}
                </ZoomableGroup>
              </ComposableMap>
              {usLocations.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                  No US visitor data in this range
                </div>
              )}
            </div>
          </section>

          {/* Detail pane */}
          <aside className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {selected ? (
              <LocationDetail location={selected} />
            ) : (
              <LocationList locations={locations} onSelect={setSelected} maxCount={maxCount} />
            )}
            {intlLocations.length > 0 && !selected && (
              <div className="border-t border-slate-200 px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">International ({intlLocations.length})</p>
                <ul className="space-y-1 text-xs">
                  {intlLocations.slice(0, 8).map((l, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="text-slate-700 truncate">{l.city ?? '?'}, {l.country_code ?? '?'}</span>
                      <span className="text-slate-500 tabular-nums shrink-0">{l.event_count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

function Kpi({ Icon, label, value }: { Icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
        <span className="text-[11px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">{value}</p>
    </div>
  )
}

function LocationList({ locations, onSelect, maxCount }: {
  locations: Location[]
  onSelect: (l: Location) => void
  maxCount: number
}) {
  return (
    <>
      <div className="px-5 py-3 border-b border-slate-200">
        <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Top locations</h2>
      </div>
      {locations.length === 0 ? (
        <p className="px-5 py-8 text-center text-slate-500 text-sm">No visitors in this range.</p>
      ) : (
        <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {locations.slice(0, 50).map((l, i) => {
            const pct = (l.event_count / maxCount) * 100
            return (
              <li key={`${l.city}-${l.region}-${i}`}>
                <button
                  type="button"
                  onClick={() => onSelect(l)}
                  className="w-full text-left px-5 py-2.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {l.city ?? '?'}
                        <span className="text-slate-400 ml-1.5">{l.region ?? l.country_code ?? ''}</span>
                      </p>
                      <p className="text-[11px] text-slate-500">{timeAgo(l.last_visit_at)}</p>
                    </div>
                    <span className="text-sm tabular-nums text-slate-700 shrink-0">{l.event_count}</span>
                  </div>
                  <div className="h-1 bg-slate-100 rounded mt-1.5 overflow-hidden">
                    <div className="h-full bg-sky-500" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function LocationDetail({ location }: { location: Location }) {
  return (
    <>
      <div className="px-5 py-3 border-b border-slate-200">
        <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Selected location</p>
        <h2 className="text-lg font-bold text-slate-900 mt-1 leading-tight">
          {location.city ?? 'Unknown'}<span className="text-slate-400 font-normal">, {location.region ?? location.country_code ?? ''}</span>
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {Number(location.latitude).toFixed(2)}°, {Number(location.longitude).toFixed(2)}°
        </p>
      </div>
      <dl className="px-5 py-4 grid grid-cols-2 gap-3 text-sm">
        <Stat label="Events"        value={location.event_count} />
        <Stat label="Sessions"      value={location.session_count} />
        <Stat label="Page views"    value={location.page_views} />
        <Stat label="Sign-ups"      value={location.sign_ups} />
        <Stat label="Unique users"  value={location.unique_users} />
        <Stat label="Last seen"     value={timeAgo(location.last_visit_at)} />
      </dl>
      {location.top_pages && location.top_pages.length > 0 && (
        <div className="px-5 pb-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
            <Clock className="w-3 h-3" strokeWidth={2} />
            Top pages from here
          </p>
          <ul className="space-y-1 text-xs">
            {location.top_pages.slice(0, 5).map((p) => (
              <li key={p} className="font-mono text-slate-700 truncate" title={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</dt>
      <dd className="text-base font-bold text-slate-900 tabular-nums mt-0.5">{value}</dd>
    </div>
  )
}
