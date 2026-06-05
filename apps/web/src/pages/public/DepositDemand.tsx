// Tenant deposit-demand letter generator (/deposit-demand).
//
// A logged-in tenant fills in a few fields (prefilled from their lease) and gets
// a print-ready, Ohio-grounded demand letter for their security deposit. Renders
// client-side via the document engine + Letterhead — no DB writes. The renter
// keeps/sends it themselves. Surfaced from the student-housing Renter Resources hub.

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { getTenantActiveLease } from '@findstoop/shared/api/leases'
import type { Lease } from '@findstoop/shared/types/lease'
import { DEPOSIT_DEMAND_FIELDS, renderDepositDemandLetter } from '@findstoop/shared/lib/documentTemplates/depositDemand'
import type { DocumentContext, TemplateField } from '@findstoop/shared/lib/documentTemplates'
import Letterhead from '../../components/documents/Letterhead'
import PoweredByStoop from '../../components/shared/PoweredByStoop'
import { inputClass } from '../../components/shared/FormField'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function DepositDemand() {
  const { user, profile } = useAuth()
  const [params] = useSearchParams()
  // Prefill the amount owed when arriving from the Deposit Check (?owed=…).
  const owed = params.get('owed')
  const [lease, setLease] = useState<Lease | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    if (owed && Number(owed) > 0) init.amount_owed = owed
    return init
  })

  useEffect(() => {
    if (!user?.id) { setLoading(false); return }
    let cancelled = false
    getTenantActiveLease(user.id)
      .then((l) => {
        if (cancelled) return
        setLease(l)
        // Prefill from the lease.
        setForm((f) => ({
          ...f,
          deposit_amount: l?.security_deposit != null ? String(l.security_deposit) : (f.deposit_amount ?? ''),
          move_out_date: l?.end_date ?? (f.move_out_date ?? ''),
        }))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user?.id])

  const prop = lease?.unit?.properties
  const ctx: DocumentContext = useMemo(() => ({
    landlord_name: String(form.landlord_name ?? ''),
    landlord_entity: String(form.landlord_name ?? ''),
    landlord_email: null,
    landlord_phone: null,
    tenant_name: profile?.full_name ?? 'Tenant',
    tenant_email: profile?.email ?? null,
    property_address: prop?.address ?? '',
    unit_label: lease?.unit?.unit_number ?? null,
    city: prop?.city ?? '',
    state: prop?.state ?? '',
    zip: prop?.zip ?? '',
    rent_amount: Number(lease?.rent_amount ?? 0),
    security_deposit: lease?.security_deposit != null ? Number(lease.security_deposit) : null,
    lease_start: lease?.start_date ?? null,
    lease_end: lease?.end_date ?? null,
    today: todayIso(),
    f: form,
  }), [form, lease, prop, profile])

  const body = useMemo(() => renderDepositDemandLetter(ctx), [ctx])
  const propertyLine = prop ? [prop.address, `${prop.city}, ${prop.state} ${prop.zip}`].filter(Boolean).join(' · ') : ''

  if (loading) {
    return <div className="flex justify-center py-20 text-mute"><Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} /></div>
  }
  if (!user) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <p className="text-ink">Please sign in to build your deposit letter.</p>
        <Link to="/login/renter" className="mt-4 inline-block bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Sign in</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toolbar — hidden in print */}
      <header className="dd-toolbar bg-white border-b border-gray-200 print:hidden sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/tenant/resources" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Renter resources
          </Link>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg">
            <Printer className="w-4 h-4" strokeWidth={1.75} /> Print or save as PDF
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 grid lg:grid-cols-2 gap-6">
        {/* Form — hidden in print */}
        <div className="dd-form print:hidden space-y-4">
          <div>
            <h1 className="text-xl font-bold text-ink">Deposit demand letter</h1>
            <p className="text-sm text-mute mt-1">Fill in the details — we’ll build a print-ready letter that cites your Ohio rights. Not legal advice.</p>
          </div>
          {DEPOSIT_DEMAND_FIELDS.map((field: TemplateField) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              {field.type === 'textarea' ? (
                <textarea rows={3} className={inputClass} value={form[field.key] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))} />
              ) : (
                <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} className={inputClass}
                  value={form[field.key] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))} />
              )}
              {field.help && <p className="text-[11px] text-mute mt-1">{field.help}</p>}
            </div>
          ))}
        </div>

        {/* Preview / printable paper */}
        <div className="dd-paper bg-white rounded-2xl border border-gray-200 shadow-sm px-7 py-9 print:border-0 print:shadow-none print:rounded-none">
          <Letterhead reference="Security deposit demand" propertyAddress={propertyLine} bodyHtml={body} />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-8 flex justify-center print:hidden">
        <PoweredByStoop />
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .dd-toolbar, .dd-form { display: none !important; }
          .dd-paper { box-shadow: none !important; border: 0 !important; padding: 0 !important; }
          @page { margin: 0.6in; size: letter; }
        }
      `}</style>
    </div>
  )
}
