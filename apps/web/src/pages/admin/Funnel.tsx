// Activation funnel + cohort retention. Two of the most useful SaaS-growth
// charts for understanding where users drop off and whether they stick around.

import { useEffect, useState } from 'react'
import {
  Loader2, UserPlus, Building2, FileText, CreditCard, TrendingDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface FunnelRow {
  signed_up: number
  added_property: number
  created_lease: number
  collected_rent: number
}

interface CohortRow {
  cohort_week: string
  cohort_size: number
  week_0: number
  week_1: number
  week_2: number
  week_3: number
  week_4: number
  week_5: number
  week_6: number
  week_7: number
}

const FUNNEL_STAGES: { key: keyof FunnelRow; label: string; sub: string; Icon: typeof UserPlus }[] = [
  { key: 'signed_up',      label: 'Signed up',          sub: 'Created a manager account', Icon: UserPlus },
  { key: 'added_property', label: 'Added a property',   sub: 'First property created',    Icon: Building2 },
  { key: 'created_lease',  label: 'Created a lease',    sub: 'First lease on any unit',   Icon: FileText },
  { key: 'collected_rent', label: 'Collected rent',     sub: 'First successful payment',  Icon: CreditCard },
]

export default function AdminFunnel() {
  const [funnel, setFunnel] = useState<FunnelRow | null>(null)
  const [cohorts, setCohorts] = useState<CohortRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data: f }, { data: c }] = await Promise.all([
        supabase.from('admin_activation_funnel').select('*').single(),
        supabase.from('admin_cohort_retention').select('*'),
      ])
      if (cancelled) return
      setFunnel(f as FunnelRow | null)
      setCohorts((c as CohortRow[] | null) ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  if (loading || !funnel) {
    return <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} /></div>
  }

  const baseline = funnel.signed_up || 1  // avoid div-by-zero
  const stageRows = FUNNEL_STAGES.map((stage, i) => {
    const count = funnel[stage.key]
    const prev  = i === 0 ? count : funnel[FUNNEL_STAGES[i - 1].key]
    const fromTop  = baseline > 0 ? (count / baseline) * 100 : 0
    const fromPrev = prev    > 0 ? (count / prev) * 100     : 0
    return { ...stage, count, fromTop, fromPrev, dropFromPrev: 100 - fromPrev }
  })

  return (
    <div className="p-4 sm:p-6 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Funnel + cohorts</h1>
        <p className="text-sm text-slate-500 mt-1">Activation drop-off and week-over-week retention.</p>
      </header>

      {/* Activation funnel */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-4">Manager activation funnel</h2>

        <div className="space-y-4">
          {stageRows.map((stage, i) => (
            <div key={stage.key}>
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-lg bg-slate-100 text-slate-700 inline-flex items-center justify-center mt-0.5">
                  <stage.Icon className="w-4 h-4" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  {/* Top row: label on the left, count on the right.
                      Description + % share live on the second row so neither
                      gets crushed when the viewport is narrow. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold text-slate-900 truncate">{stage.label}</p>
                    <span className="text-lg font-bold tabular-nums text-slate-900 shrink-0">{stage.count.toLocaleString()}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 mt-0.5 mb-1.5">
                    <p className="text-xs text-slate-500 truncate">{stage.sub}</p>
                    <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{stage.fromTop.toFixed(0)}% of top</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600" style={{ width: `${stage.fromTop}%` }} />
                  </div>
                </div>
              </div>
              {i > 0 && stage.dropFromPrev > 0 && (
                <div className="ml-12 mt-1.5 flex items-start gap-1.5 text-[11px] text-red-700">
                  <TrendingDown className="w-3 h-3 mt-0.5 shrink-0" strokeWidth={2} />
                  <span>{stage.dropFromPrev.toFixed(0)}% drop-off ({Number(stageRows[i - 1].count - stage.count).toLocaleString()} lost from previous stage)</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="text-[11px] text-slate-500 mt-4">
          Funnel measures managers only. Each stage counts unique managers who reached that point ever — not weekly cohorts.
        </p>
      </section>

      {/* Cohort retention */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Cohort retention</h2>
          <p className="text-[11px] text-slate-500 mt-1">% of each weekly signup cohort active in subsequent weeks. Colors saturate by retention rate.</p>
        </div>
        {cohorts.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500 text-sm">No cohorts yet — need at least one week of signup history.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap">Cohort</th>
                  <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap">Size</th>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((w) => (
                    <th key={w} className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">W{w}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.cohort_week} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-700 font-medium">
                      {new Date(c.cohort_week).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{c.cohort_size}</td>
                    {[c.week_0, c.week_1, c.week_2, c.week_3, c.week_4, c.week_5, c.week_6, c.week_7].map((cell, w) => {
                      const pct = c.cohort_size > 0 ? (cell / c.cohort_size) * 100 : 0
                      // Skip cells that are in the future for this cohort
                      const cohortStart = new Date(c.cohort_week).getTime()
                      const weekStart = cohortStart + w * 7 * 86400000
                      const future = weekStart > Date.now()
                      return (
                        <td key={w} className="px-3 py-1.5 text-right tabular-nums">
                          {future ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <span
                              className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold"
                              style={{
                                backgroundColor: heatColor(pct),
                                color: pct > 50 ? 'white' : '#0f172a',
                              }}
                            >
                              {pct.toFixed(0)}%
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-500 px-5 py-3 border-t border-slate-100">
          W0 is the signup week itself. W1+ measures whether each user returned in the following weeks.
        </p>
      </section>
    </div>
  )
}

// Soft teal gradient — pale at 0%, saturated at 100%. Matches the brand color
// without screaming red/green at the eye.
function heatColor(pct: number): string {
  // 0 → slate-100, 100 → emerald-600
  const clamped = Math.max(0, Math.min(100, pct))
  // Interpolate from light gray to brand teal
  const r = Math.round(241 - (241 - 5)   * clamped / 100)
  const g = Math.round(245 - (245 - 150) * clamped / 100)
  const b = Math.round(249 - (249 - 105) * clamped / 100)
  return `rgb(${r}, ${g}, ${b})`
}
