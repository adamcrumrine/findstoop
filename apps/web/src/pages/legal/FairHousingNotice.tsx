// Fair Housing Act notice — informational disclosure given to every tenant.
//
// Federal law (42 USC 3601 et seq.) prohibits discrimination in the sale,
// rental, or financing of housing on the basis of race, color, national
// origin, religion, sex, familial status, or disability. Many states add
// additional protected classes; we use the federal baseline here and let
// state-specific text live in tenant_state_notices later.
//
// Acknowledgment is a paper trail — not legally required, but useful if
// there's ever a dispute about whether the tenant was given the notice.

import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer, CheckCircle2, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'

export default function FairHousingNotice() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const leaseId = params.get('lease') ?? null

  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const isTenant = profile?.role === 'tenant'

  useEffect(() => {
    if (!leaseId) return
    supabase
      .from('leases')
      .select('fair_housing_acknowledged_at')
      .eq('id', leaseId)
      .single()
      .then(({ data }) => setAcknowledgedAt(data?.fair_housing_acknowledged_at ?? null))
  }, [leaseId])

  const handleAcknowledge = async () => {
    if (!leaseId || !isTenant) return
    setSaving(true)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('leases')
      .update({ fair_housing_acknowledged_at: now })
      .eq('id', leaseId)
    setSaving(false)
    if (error) { toast.error('Could not save acknowledgment'); return }
    setAcknowledgedAt(now)
    toast.success('Thanks — notice acknowledged.')
  }

  const back = profile?.role === 'tenant' ? '/tenant/documents' : '/manager/documents'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lease-pdf-toolbar sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(back)} className="inline-flex items-center gap-1.5 text-sm font-medium text-mute hover:text-ink">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">
            <Printer className="w-4 h-4" strokeWidth={1.75} />
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="lease-pdf-paper max-w-4xl mx-auto bg-white shadow-sm my-6 print:my-0 print:shadow-none p-10 print:p-0">
        <header className="text-center border-b border-gray-300 pb-6 mb-8">
          <p className="text-xs uppercase tracking-widest text-mute">U.S. Department of Housing and Urban Development</p>
          <h1 className="mt-2 text-2xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>
            Fair Housing — Equal Opportunity Notice
          </h1>
          <p className="mt-2 text-sm text-mute italic">Title VIII of the Civil Rights Act of 1968 (42 U.S.C. § 3601 et seq.)</p>
        </header>

        <section className="prose prose-sm max-w-none" style={{ fontFamily: 'Georgia, serif' }}>
          <p className="text-base">
            We are pledged to the letter and spirit of U.S. policy for the achievement of equal housing
            opportunity. We encourage and support an affirmative advertising and marketing program in which
            there are no barriers to obtaining housing because of race, color, religion, sex, handicap,
            familial status, or national origin.
          </p>

          <h3 className="mt-6 font-semibold">Protected classes under federal law:</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Race</strong></li>
            <li><strong>Color</strong></li>
            <li><strong>National origin</strong></li>
            <li><strong>Religion</strong></li>
            <li><strong>Sex</strong> (including gender identity and sexual orientation)</li>
            <li><strong>Familial status</strong> (presence of children under 18 in the household)</li>
            <li><strong>Disability</strong></li>
          </ul>

          <p className="mt-4">
            Many states and localities add further protected classes — for example, source of income,
            age, marital status, military status, or ancestry. Your landlord must comply with whichever
            protections are most expansive at your address.
          </p>

          <h3 className="mt-6 font-semibold">Reasonable accommodations and modifications</h3>
          <p>
            If you have a disability and need a reasonable accommodation in policies, services, or
            procedures, or a reasonable modification of the premises, ask your landlord in writing.
            Landlords must engage in an interactive process and grant reasonable requests unless they
            would impose an undue financial or administrative burden.
          </p>

          <h3 className="mt-6 font-semibold">If you believe you've been discriminated against</h3>
          <p>
            You can file a complaint at no cost with the U.S. Department of Housing and Urban Development
            within one year of the alleged violation:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-0.5">
            <li>Online: <span className="font-mono">hud.gov/fairhousing</span></li>
            <li>Toll-free: <span className="font-mono">1-800-669-9777</span></li>
            <li>TTY: <span className="font-mono">1-800-927-9275</span></li>
          </ul>
          <p className="mt-2">
            You may also contact your state or local fair housing agency, which can investigate complaints
            under state and local law.
          </p>
        </section>

        {leaseId && (
          <div className="mt-10 pt-6 border-t border-gray-300 print:hidden">
            {acknowledgedAt ? (
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" strokeWidth={1.75} />
                <div>
                  <p className="font-semibold text-emerald-900 text-sm">Notice acknowledged</p>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Recorded on {new Date(acknowledgedAt).toLocaleString()}.
                  </p>
                </div>
              </div>
            ) : isTenant ? (
              <button
                onClick={handleAcknowledge}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} /> : <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />}
                I acknowledge I have read this notice
              </button>
            ) : (
              <p className="text-xs text-mute italic">Waiting for tenant acknowledgment.</p>
            )}
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-gray-200 text-xs text-mute text-center">
          <p>Generated by FindStoop · findstoop.com</p>
          {!leaseId && <p className="mt-1">
            <Link to={back} className="text-brand-700 hover:underline">Return to documents</Link>
          </p>}
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .lease-pdf-toolbar { display: none !important; }
          .lease-pdf-paper { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          @page { margin: 0.6in; size: letter; }
        }
      `}</style>
    </div>
  )
}
