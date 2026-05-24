// Real-time-ish event feed. Polls every 5s. Anonymizes user_id to a
// 6-char ref. Shows what's happening on the platform without any PII.

import { useEffect, useState } from 'react'
import { Loader2, FileText, LogIn, UserPlus, Eye, AlertCircle, MousePointerClick, MapPin } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface EventRow {
  id: number
  ts: string
  session_id: string
  user_id: string | null
  user_role: string | null
  event_type: string
  page_path: string | null
  metadata: Record<string, unknown> | null
  country_code: string | null
  region: string | null
  city: string | null
}

const ICON: Record<string, typeof FileText> = {
  page_view: Eye,
  sign_in:   LogIn,
  sign_up:   UserPlus,
  sign_out:  LogIn,
  action:    MousePointerClick,
  error:     AlertCircle,
}

const ROLE_COLOR: Record<string, string> = {
  manager: 'bg-blue-50 text-blue-700 border-blue-200',
  tenant:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  admin:   'bg-amber-50 text-amber-700 border-amber-200',
}

const TYPE_COLOR: Record<string, string> = {
  page_view: 'bg-slate-100 text-slate-600',
  sign_in:   'bg-blue-100 text-blue-700',
  sign_up:   'bg-emerald-100 text-emerald-700',
  sign_out:  'bg-slate-100 text-slate-600',
  action:    'bg-purple-100 text-purple-700',
  error:     'bg-red-100 text-red-700',
}

export default function AdminActivity() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  const load = async () => {
    // Admin's own browsing is filtered at the source (analytics.ts skips
    // when user_role='admin'), but we belt-and-braces filter here too in
    // case anything historical lingers.
    let q = supabase
      .from('analytics_events')
      .select('*')
      .or('user_role.is.null,user_role.neq.admin')
      .order('ts', { ascending: false })
      .limit(200)
    if (filter !== 'all') q = q.eq('event_type', filter)
    const { data } = await q
    setEvents((data ?? []) as EventRow[])
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true)
    load()
    const intvl = setInterval(load, 5000)
    return () => clearInterval(intvl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  return (
    <div className="p-6 max-w-6xl">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Activity</h1>
          <p className="text-sm text-slate-500 mt-1">Live event stream — refreshing every 5 s. User IDs shown as 6-char refs only.</p>
        </div>
      </header>

      <div className="flex gap-2 mb-4">
        {(['all', 'page_view', 'sign_in', 'sign_up', 'action', 'error'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500 text-sm">
          No events yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">When</th>
                <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Type</th>
                <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Who</th>
                <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Location</th>
                <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Path / detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const Icon = ICON[e.event_type] ?? MousePointerClick
                return (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-500 tabular-nums whitespace-nowrap">
                      {new Date(e.ts).toLocaleTimeString()} <span className="text-slate-300">·</span> {new Date(e.ts).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${TYPE_COLOR[e.event_type] ?? 'bg-slate-100 text-slate-600'}`}>
                        <Icon className="w-3 h-3" strokeWidth={2} />
                        {e.event_type}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {e.user_id ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono text-xs text-slate-700">{e.user_id.slice(0, 6)}</span>
                          {e.user_role && (
                            <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${ROLE_COLOR[e.user_role] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                              {e.user_role}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">anon</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600 text-xs whitespace-nowrap">
                      {e.city || e.region || e.country_code ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" strokeWidth={2} />
                          {[e.city, e.region].filter(Boolean).join(', ') || e.country_code}
                          {e.city && e.country_code && e.country_code !== 'US' && (
                            <span className="text-slate-400">· {e.country_code}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600 truncate max-w-md">
                      {e.page_path ?? renderMetadata(e.metadata)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function renderMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '—'
  const entries = Object.entries(metadata).slice(0, 3)
  return entries.map(([k, v]) => `${k}=${String(v).slice(0, 40)}`).join(' · ')
}
