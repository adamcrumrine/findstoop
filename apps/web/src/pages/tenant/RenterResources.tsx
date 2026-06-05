// Tenant "Renter Resources" hub — shown when the landlord has turned on Student
// Housing mode for the property. Surfaces the renter-help tools (lease explainer,
// Ohio rights, move-in documentation, deposit protection). No login wall beyond
// the tenant portal; co-branded "Powered by Stoop".

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { getTenantActiveLease } from '@findstoop/shared/api/leases'
import type { Lease } from '@findstoop/shared/types/lease'
import PoweredByStoop from '../../components/shared/PoweredByStoop'
import { FileSearch, ScrollText, Camera, ShieldCheck, Banknote, Scale, Loader2, GraduationCap, ChevronRight, type LucideIcon } from 'lucide-react'

export default function RenterResources() {
  const { user } = useAuth()
  const [lease, setLease] = useState<Lease | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    getTenantActiveLease(user.id)
      .then((l) => { if (!cancelled) setLease(l) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user?.id])

  if (loading) {
    return <div className="flex justify-center py-20 text-mute"><Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} /></div>
  }

  const enabled = !!lease?.unit?.properties?.student_housing
  const leaseId = lease?.id

  if (!enabled) {
    return (
      <div className="max-w-xl mx-auto py-14 text-center">
        <GraduationCap className="w-10 h-10 mx-auto mb-3 text-mute-400" strokeWidth={1.5} />
        <p className="font-semibold text-ink">Renter resources aren't enabled here</p>
        <p className="text-sm text-mute mt-1">These tools turn on when your landlord enables them for a student rental.</p>
      </div>
    )
  }

  const tools: { icon: LucideIcon; title: string; desc: string; to: string; external?: boolean }[] = [
    { icon: FileSearch, title: 'Understand your lease', desc: "Upload your lease for a plain-English breakdown — your obligations, the red flags, and your rights.", to: '/renter-check', external: true },
    { icon: ScrollText, title: 'Know your rights', desc: 'Your rights as an Ohio renter — repairs, entry, deposits, and more.', to: '/legal/ohio-tenant-rights', external: true },
    { icon: Camera, title: 'Document your move-in', desc: 'Photograph the place room-by-room so your security deposit is protected.', to: leaseId ? `/tenant/lease/${leaseId}/inspection/move_in` : '#' },
    { icon: ShieldCheck, title: 'Document your move-out', desc: 'At move-out, photograph the condition so any deductions can be checked for fairness.', to: leaseId ? `/tenant/lease/${leaseId}/inspection/move_out` : '#' },
    { icon: Scale, title: 'Check if deductions are fair', desc: "Paste or upload your landlord's deduction letter — we'll flag what's unfair under Ohio law and what you may be owed back.", to: '/deposit-check', external: true },
    { icon: Banknote, title: 'Get your deposit back', desc: 'Build a print-ready demand letter that cites your Ohio rights (ORC 5321.16).', to: '/deposit-demand', external: true },
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-ink">Renter resources</h1>
        <p className="text-sm text-mute mt-1">Free tools to help you rent smart — especially around your security deposit.</p>
      </header>

      <div className="space-y-3">
        {tools.map((t) => {
          const Icon = t.icon
          const inner = (
            <>
              <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 inline-flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink">{t.title}</p>
                <p className="text-xs text-mute mt-0.5">{t.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-mute-400 shrink-0" strokeWidth={1.75} />
            </>
          )
          const cls = 'flex items-center gap-3 bg-white rounded-2xl border border-gray-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all'
          return t.external
            ? <a key={t.title} href={t.to} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
            : <Link key={t.title} to={t.to} className={cls}>{inner}</Link>
        })}
      </div>

      <div className="mt-6 flex justify-center"><PoweredByStoop size="md" /></div>
    </div>
  )
}
