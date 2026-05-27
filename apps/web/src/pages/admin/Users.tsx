// Anonymized user roster. Reads from admin_users_anon view — only the 6-char
// user_ref is shown by default. The raw_id field is in the response so
// queries downstream can still join, but we never render it.

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Users as UsersIcon, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import UserRefBadge from '../../components/admin/UserRefBadge'

interface Row {
  user_ref: string
  raw_id: string
  role: 'manager' | 'tenant' | 'admin' | null
  signed_up_at: string
  last_seen_at: string | null
  event_count: number
  property_count: number
  lease_count: number
  lifetime_cost_cents: number
}

const ROLE_COLOR: Record<string, string> = {
  manager: 'bg-blue-50 text-blue-700 border-blue-200',
  tenant:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  admin:   'bg-amber-50 text-amber-700 border-amber-200',
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return `${Math.round(s)}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

function activityScore(row: Row): number {
  // Simple weighted activity index. Tunable later.
  const days = row.last_seen_at ? Math.max(1, (Date.now() - new Date(row.last_seen_at).getTime()) / 86400000) : 999
  const recency = Math.max(0, 30 - days)
  return Math.round(recency * 2 + Math.log10(row.event_count + 1) * 10 + row.property_count * 3 + row.lease_count * 5)
}

export default function AdminUsers() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState<'all' | 'manager' | 'tenant' | 'admin'>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('admin_users_anon').select('*').order('signed_up_at', { ascending: false })
      if (cancelled) return
      setRows((data ?? []) as Row[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    let out = roleFilter === 'all' ? rows : rows.filter((r) => r.role === roleFilter)
    if (query) out = out.filter((r) => r.user_ref.includes(query.toLowerCase()))
    return out
  }, [rows, roleFilter, query])

  return (
    <div className="p-4 sm:p-6 max-w-6xl">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Users</h1>
        <p className="text-sm text-slate-500 mt-1">Anonymized roster — 6-character refs, no PII visible.</p>
      </header>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {(['all', 'manager', 'tenant', 'admin'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRoleFilter(r)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              roleFilter === r ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {r} ({r === 'all' ? rows.length : rows.filter((row) => row.role === r).length})
          </button>
        ))}
        <div className="ml-auto relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="ref lookup…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md font-mono w-36 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500 text-sm">
          <UsersIcon className="w-8 h-8 mx-auto mb-2 text-slate-300" strokeWidth={1.5} />
          No users match.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
         <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <Th>Ref</Th>
                <Th>Role</Th>
                <Th>Signed up</Th>
                <Th>Last seen</Th>
                <Th align="right">Events</Th>
                <Th align="right">Properties</Th>
                <Th align="right">Leases</Th>
                <Th align="right">Cost</Th>
                <Th align="right">Score</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.user_ref} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <UserRefBadge userId={r.raw_id} refLabel={r.user_ref} />
                  </td>
                  <td className="px-4 py-2">
                    {r.role ? (
                      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${ROLE_COLOR[r.role]}`}>
                        {r.role}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-xs">no role</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                    {new Date(r.signed_up_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                    {timeAgo(r.last_seen_at)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">{r.event_count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">{r.property_count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">{r.lease_count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                    {r.lifetime_cost_cents > 0
                      ? `$${(Number(r.lifetime_cost_cents) / 100).toFixed(2)}`
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">{activityScore(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
         </div>
        </div>
      )}
    </div>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-2.5 text-${align} text-[11px] uppercase tracking-wider text-slate-500 font-semibold`}>
      {children}
    </th>
  )
}
