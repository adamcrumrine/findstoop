// Tenant payment receipt — a receipt that looks like a receipt.
//
// Standalone print page (same pattern as /manager/invoice/:id): no app nav,
// print toolbar hidden on print, opens cleanly in a new tab. RLS scopes the
// payments read to the tenant's own rows (and their manager/admin), so the
// page needs no access logic of its own. Presents as the landlord's company
// when branding is set — a receipt is a landlord↔tenant document, not a
// platform one — with the platform in the footer.

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useLandlordBranding } from '../../hooks/useLandlordBranding'
import { formatUsdCents } from '@findstoop/shared/lib/format'
import { BRAND } from '../../lib/brand'
import type { Payment, PaymentType } from '@findstoop/shared/types/payment'

const TYPE_LABEL: Record<PaymentType, string> = {
  rent: 'Rent payment',
  late_fee: 'Late fee',
  pet_fee: 'Pet fee',
  pet_deposit: 'Pet deposit',
  utility: 'Utility payment',
  fee: 'Fee',
  fine: 'Fine',
  credit: 'Credit',
  other: 'Payment',
}

interface ReceiptRow extends Payment {
  lease: {
    unit: {
      unit_number: string | null
      properties: {
        name: string | null
        address: string | null
        city: string | null
        state: string | null
        zip: string | null
      } | null
    } | null
  } | null
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function TenantReceiptPdf() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const landlord = useLandlordBranding(profile?.id)
  const [payment, setPayment] = useState<ReceiptRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    supabase
      .from('payments')
      .select('*, lease:leases(unit:units(unit_number, properties(name, address, city, state, zip)))')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: qErr }) => {
        if (cancelled) return
        if (qErr) setError(qErr.message)
        else if (!data) setError('Receipt not found.')
        else setPayment(data as unknown as ReceiptRow)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  if (error || !payment || payment.status !== 'completed') {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <p className="text-mute">
          {error ?? (payment ? 'This payment hasn’t completed yet — receipts are issued once a payment clears.' : 'Receipt not found.')}
        </p>
        <Link to="/tenant/pay-rent" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 mt-4">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back to Pay Rent
        </Link>
      </div>
    )
  }

  const prop = payment.lease?.unit?.properties
  const unitNumber = payment.lease?.unit?.unit_number
  const payerName = profile?.full_name ?? null
  const issuer = landlord?.companyName ?? BRAND.name
  const paidOn = payment.paid_at ?? payment.created_at

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Toolbar — hidden on print */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/tenant/pay-rent" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back to Pay Rent
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg"
          >
            <Printer className="w-4 h-4" strokeWidth={1.75} />
            Print or save as PDF
          </button>
        </div>
      </div>

      {/* Paper */}
      <div className="max-w-2xl mx-auto bg-white shadow-sm my-6 print:my-0 print:shadow-none">
        <div className="px-10 py-12 print:px-12 print:py-10 text-ink" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Receipt</h1>
              <p className="text-sm text-mute mt-1">Payment confirmation</p>
            </div>
            {landlord?.logoUrl ? (
              <img src={landlord.logoUrl} alt={issuer} className="h-10 max-w-[180px] object-contain" />
            ) : (
              <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-10" />
            )}
          </div>

          {/* Paid banner */}
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-8 print:border print:border-green-300">
            <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" strokeWidth={1.75} />
            <div>
              <p className="text-lg font-bold text-green-800">{formatUsdCents(Number(payment.amount))} paid</p>
              <p className="text-xs text-green-700">{fmtDate(paidOn)}</p>
            </div>
          </div>

          {/* Details */}
          <div className="text-sm space-y-2.5 mb-8">
            <div className="flex justify-between gap-6 py-1.5 border-b border-gray-100">
              <span className="text-mute">Payment type</span>
              <span className="font-medium">{TYPE_LABEL[payment.type] ?? 'Payment'}</span>
            </div>
            {payment.due_date && (
              <div className="flex justify-between gap-6 py-1.5 border-b border-gray-100">
                <span className="text-mute">For period due</span>
                <span className="font-medium">{fmtDate(payment.due_date)}</span>
              </div>
            )}
            {payerName && (
              <div className="flex justify-between gap-6 py-1.5 border-b border-gray-100">
                <span className="text-mute">Paid by</span>
                <span className="font-medium">{payerName}</span>
              </div>
            )}
            <div className="flex justify-between gap-6 py-1.5 border-b border-gray-100">
              <span className="text-mute">Paid to</span>
              <span className="font-medium">{issuer}</span>
            </div>
            {(prop?.name || prop?.address) && (
              <div className="flex justify-between gap-6 py-1.5 border-b border-gray-100">
                <span className="text-mute">Property</span>
                <span className="font-medium text-right">
                  {prop?.name ?? prop?.address}
                  {unitNumber ? ` · Unit ${unitNumber}` : ''}
                  {prop?.name && prop?.address ? <><br /><span className="font-normal text-mute">{[prop.address, prop.city, prop.state, prop.zip].filter(Boolean).join(', ')}</span></> : null}
                </span>
              </div>
            )}
            {payment.memo && (
              <div className="flex justify-between gap-6 py-1.5 border-b border-gray-100">
                <span className="text-mute">Memo</span>
                <span className="font-medium text-right">{payment.memo}</span>
              </div>
            )}
            {payment.stripe_payment_id && payment.stripe_payment_id !== 'comp' && (
              <div className="flex justify-between gap-6 py-1.5 border-b border-gray-100">
                <span className="text-mute">Confirmation</span>
                <span className="font-mono text-xs pt-0.5">{payment.stripe_payment_id}</span>
              </div>
            )}
          </div>

          {/* Amount note — the surcharge (if the payment was made by card) is
              charged by the processor at payment time; the recorded rent
              amount above is what the landlord received toward the lease. */}
          <p className="text-xs text-mute mb-10">
            Amount shown is the amount applied to your lease. Any processing fee appears separately
            on your statement. Debit cards are never surcharged — if you paid by debit, the fee is
            refunded automatically once your bank confirms the card type, so you may see the charge
            and its refund as two lines.
          </p>

          {/* Footer */}
          <div className="pt-6 border-t border-gray-200 flex items-center justify-between text-xs text-mute">
            <span>Issued by {issuer}</span>
            <span>Generated by {BRAND.name} · {BRAND.domain}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
