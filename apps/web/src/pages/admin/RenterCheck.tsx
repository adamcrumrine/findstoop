// Admin: Renter Check leads + attribution.
//
// Slices lease_analyses by referral channel (?ref=, i.e. partner school) and
// lists the workable leads. Reads the is_admin()-gated admin_renter_check_*
// views. The renter's email is never shown (masked to a boolean upstream); the
// landlord is the conversion lead, so landlord contact is surfaced.

import { useEffect, useMemo, useState } from 'react'
import { Loader2, GraduationCap, Building2, UserCheck, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface SchoolRow {
  school: string
  total: number
  with_landlord: number
  on_platform: number
  convertible: number
  invited: number
  emailed: number
  tenant_leads: number
  avg_red_flags: number | null
  last_at: string | null
}

interface LeadRow {
  id: string
  created_at: string
  school: string
  state_detected: string | null
  landlord_name: string | null
  landlord_email: string | null
  property_address: string | null
  red_flag_count: number
  high_flag_count: number
  on_platform: boolean
  invited: boolean
  summary_emailed: boolean
  tenant_lead_captured: boolean
  summary: string | null
}

export default function AdminRenterCheck() {
  const [schools, setSchools] = useState<SchoolRow[]>([])
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [schoolFilter, setSchoolFilter] = useState('all')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data: s }, { data: l }] = await Promise.all([
        supabase.from('admin_renter_check_by_school').select('*'),
        supabase.from('admin_renter_check_leads').select('*').limit(250),
      ])
      if (cancelled) return
      setSchools((s as SchoolRow[] | null) ?? [])
      setLeads((l as LeadRow[] | null) ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const totals = useMemo(() => schools.reduce(
    (a, r) => ({
      total: a.total + r.total,
      with_landlord: a.with_landlord + r.with_landlord,
      convertible: a.convertible + r.convertible,
      on_platform: a.on_platform + r.on_platform,
      invited: a.invited + r.invited,
    }),
    { total: 0, with_landlord: 0, convertible: 0, on_platform: 0, invited: 0 }
  ), [schools])

  const visibleLeads = schoolFilter === 'all' ? leads : leads.filter((l) => l.school === schoolFilter)

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} /></div>
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Renter Check — leads &amp; attribution</h1>
        <p className="text-sm text-slate-500 mt-1">Lease checks by partner channel, and the landlords they surface.</p>
      </header>

      {schools.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-12 text-center text-slate-500 text-sm">
          No lease checks yet. Once renters use <span className="font-mono">/renter-check</span>, leads show up here.
        </div>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <Tile icon={GraduationCap} label="Leases checked" value={totals.total} />
            <Tile icon={Building2} label="Landlords surfaced" value={totals.with_landlord} />
            <Tile icon={UserCheck} label="Convertible" value={totals.convertible} sub="have email, not on platform" />
            <Tile icon={UserCheck} label="Already on Stoop" value={totals.on_platform} />
            <Tile icon={Send} label="Invited by renter" value={totals.invited} />
          </div>

          {/* Per-school */}
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-slate-200">
              <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">By channel</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[760px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <Th left>Channel</Th><Th>Checks</Th><Th>Landlord on file</Th><Th>On platform</Th>
                    <Th>Convertible</Th><Th>Invited</Th><Th>Emailed</Th><Th>Avg flags</Th><Th>Last</Th>
                  </tr>
                </thead>
                <tbody>
                  {schools.map((r) => (
                    <tr key={r.school} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{r.school}</td>
                      <Td>{r.total}</Td><Td>{r.with_landlord}</Td><Td>{r.on_platform}</Td>
                      <Td><span className="font-semibold text-emerald-700">{r.convertible}</span></Td>
                      <Td>{r.invited}</Td><Td>{r.emailed}</Td><Td>{r.avg_red_flags ?? '—'}</Td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500 whitespace-nowrap">
                        {r.last_at ? new Date(r.last_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Leads */}
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
              <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Leads ({visibleLeads.length})</h2>
              <select value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}
                className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white">
                <option value="all">All channels</option>
                {schools.map((s) => <option key={s.school} value={s.school}>{s.school}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[820px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <Th left>Date</Th><Th left>Channel</Th><Th left>Landlord</Th><Th left>Property</Th>
                    <Th>State</Th><Th>Flags</Th><Th left>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLeads.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(l.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{l.school}</td>
                      <td className="px-3 py-2 min-w-0">
                        <div className="text-slate-800 font-medium truncate max-w-[180px]">{l.landlord_name ?? '—'}</div>
                        {l.landlord_email && <div className="text-slate-400 truncate max-w-[180px]">{l.landlord_email}</div>}
                      </td>
                      <td className="px-3 py-2 text-slate-600 truncate max-w-[200px]" title={l.property_address ?? ''}>{l.property_address ?? '—'}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{l.state_detected ?? '—'}</td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        <span className="text-slate-800">{l.red_flag_count}</span>
                        {l.high_flag_count > 0 && <span className="text-red-600"> ({l.high_flag_count} hi)</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {l.on_platform && <Badge tone="emerald">on platform</Badge>}
                          {l.invited && <Badge tone="blue">invited</Badge>}
                          {l.summary_emailed && <Badge tone="slate">emailed</Badge>}
                          {l.tenant_lead_captured && <Badge tone="slate">renter lead</Badge>}
                          {!l.on_platform && !l.invited && l.landlord_email && <Badge tone="amber">convertible</Badge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 px-5 py-3 border-t border-slate-100">
              Renter emails are never shown here — only whether a renter opted into a summary. Showing the {leads.length} most recent.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

function Tile({ icon: Icon, label, value, sub }: { icon: typeof Building2; label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 text-slate-400 mb-1.5"><Icon className="w-4 h-4" strokeWidth={1.75} /><span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">{label}</span></div>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value.toLocaleString()}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Th({ children, left }: { children: React.ReactNode; left?: boolean }) {
  return <th className={`px-3 py-2 font-semibold ${left ? 'text-left' : 'text-right'} whitespace-nowrap`}>{children}</th>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-right tabular-nums text-slate-700">{children}</td>
}
function Badge({ children, tone }: { children: React.ReactNode; tone: 'emerald' | 'blue' | 'amber' | 'slate' }) {
  const cls = {
    emerald: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    slate: 'bg-slate-100 text-slate-600',
  }[tone]
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{children}</span>
}
