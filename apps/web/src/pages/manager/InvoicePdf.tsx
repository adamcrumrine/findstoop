import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { BRAND } from '../../lib/brand'

interface InvoiceLine {
  id: string
  description: string | null
  quantity: number
  unitAmount: number
  amount: number
  periodStart: string | null
  periodEnd: string | null
}

interface InvoiceDetail {
  id: string
  number: string | null
  status: string | null
  currency: string
  created: string
  dueDate: string | null
  periodStart: string | null
  periodEnd: string | null
  subtotal: number
  tax: number
  total: number
  amountPaid: number
  amountDue: number
  customerEmail: string | null
  customerName: string | null
  customerAddress: {
    line1?: string | null
    line2?: string | null
    city?: string | null
    state?: string | null
    postal_code?: string | null
    country?: string | null
  } | null
  lines: InvoiceLine[]
  paymentMethod: {
    type: string
    cardBrand: string | null
    cardLast4: string | null
    bankLast4: string | null
    bankName: string | null
  } | null
}

export default function InvoicePdf() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { data, error: invErr } = await supabase.functions.invoke('stripe-manage', {
          body: { action: 'invoice', invoiceId: id },
        })
        if (cancelled) return
        if (invErr) throw invErr
        if (data?.error) throw new Error(data.error)
        setInvoice(data.invoice as InvoiceDetail)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load invoice')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  // Auto-print when ?print=1 is set
  useEffect(() => {
    if (!invoice || searchParams.get('print') !== '1') return
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [invoice, searchParams])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <p className="text-mute">{error ?? 'Invoice not found.'}</p>
        <Link to="/manager/billing" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 mt-4">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back to Billing
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Toolbar — hidden on print */}
      <div className="invoice-toolbar sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to="/manager/billing"
            className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back to Billing
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
      <div className="invoice-paper max-w-3xl mx-auto bg-white shadow-sm my-6 print:my-0 print:shadow-none">
        <div className="px-10 py-12 print:px-12 print:py-10 text-ink" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          {/* Header */}
          <div className="flex items-start justify-between mb-10">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Invoice</h1>
              <div className="mt-4 text-sm space-y-0.5">
                <div className="flex gap-8"><span className="font-semibold w-32">Invoice number</span><span className="text-mute">{invoice.number ?? invoice.id}</span></div>
                <div className="flex gap-8"><span className="font-semibold w-32">Date of issue</span><span className="text-mute">{fmtDate(invoice.created)}</span></div>
                {invoice.dueDate && (
                  <div className="flex gap-8"><span className="font-semibold w-32">Date due</span><span className="text-mute">{fmtDate(invoice.dueDate)}</span></div>
                )}
                {invoice.status && (
                  <div className="flex gap-8"><span className="font-semibold w-32">Status</span><StatusPill status={invoice.status} amountPaid={invoice.amountPaid} amountDue={invoice.amountDue} /></div>
                )}
              </div>
            </div>
            <img src={BRAND.logo.horizontal} alt={BRAND.name} className="h-10" />
          </div>

          {/* Parties */}
          <div className="grid grid-cols-2 gap-8 mb-10 text-sm">
            <div>
              <p className="font-bold text-ink mb-1">{BRAND.name}</p>
              <p className="text-mute">Property management software</p>
              <p className="text-mute">{BRAND.domain}</p>
            </div>
            <div>
              <p className="font-bold text-ink mb-1">Bill to</p>
              {invoice.customerName && <p className="text-mute">{invoice.customerName}</p>}
              {invoice.customerEmail && <p className="text-mute">{invoice.customerEmail}</p>}
              {invoice.customerAddress?.line1 && <p className="text-mute">{invoice.customerAddress.line1}</p>}
              {invoice.customerAddress?.line2 && <p className="text-mute">{invoice.customerAddress.line2}</p>}
              {(invoice.customerAddress?.city || invoice.customerAddress?.state || invoice.customerAddress?.postal_code) && (
                <p className="text-mute">
                  {[invoice.customerAddress?.city, invoice.customerAddress?.state, invoice.customerAddress?.postal_code].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>

          {/* Big total */}
          <div className="mb-8">
            <p className="text-2xl font-bold">
              {money(invoice.total, invoice.currency)} {invoice.currency.toUpperCase()}{' '}
              <span className="font-normal text-mute">
                {invoice.status === 'paid'
                  ? `paid on ${fmtDate(invoice.created)}`
                  : invoice.dueDate ? `due ${fmtDate(invoice.dueDate)}` : ''}
              </span>
            </p>
          </div>

          {/* Lines */}
          <table className="w-full text-sm mb-8">
            <thead>
              <tr className="border-b border-gray-300 text-left">
                <th className="py-2 font-semibold">Description</th>
                <th className="py-2 font-semibold text-right w-16">Qty</th>
                <th className="py-2 font-semibold text-right w-24">Unit price</th>
                <th className="py-2 font-semibold text-right w-24">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id} className="align-top">
                  <td className="py-3">
                    <p>{line.description ?? `${BRAND.name} subscription`}</p>
                    {line.periodStart && line.periodEnd && (
                      <p className="text-xs text-mute mt-0.5">
                        {fmtDate(line.periodStart)} – {fmtDate(line.periodEnd)}
                      </p>
                    )}
                  </td>
                  <td className="py-3 text-right">{line.quantity}</td>
                  <td className="py-3 text-right">{money(line.unitAmount, invoice.currency)}</td>
                  <td className="py-3 text-right">{money(line.amount, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="ml-auto w-72 text-sm space-y-1.5">
            <div className="flex justify-between border-t border-gray-200 pt-2">
              <span className="text-mute">Subtotal</span>
              <span>{money(invoice.subtotal, invoice.currency)}</span>
            </div>
            {invoice.tax > 0 && (
              <div className="flex justify-between">
                <span className="text-mute">Tax</span>
                <span>{money(invoice.tax, invoice.currency)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold">
              <span>Total</span>
              <span>{money(invoice.total, invoice.currency)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-300 pt-1.5 font-bold">
              <span>Amount due</span>
              <span>{money(invoice.amountDue, invoice.currency)} {invoice.currency.toUpperCase()}</span>
            </div>
          </div>

          {/* Payment method */}
          {invoice.paymentMethod && (
            <div className="mt-10 pt-6 border-t border-gray-200 text-sm">
              <p className="font-semibold mb-1">Paid via</p>
              <p className="text-mute">
                {invoice.paymentMethod.type === 'card'
                  ? `${(invoice.paymentMethod.cardBrand ?? 'Card').toUpperCase()} ····${invoice.paymentMethod.cardLast4 ?? '••••'}`
                  : invoice.paymentMethod.bankName
                    ? `${invoice.paymentMethod.bankName} ····${invoice.paymentMethod.bankLast4 ?? '••••'}`
                    : invoice.paymentMethod.type}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-gray-200 text-xs text-mute text-center">
            <p>Thank you for using {BRAND.name}. Questions? {BRAND.helloEmail}</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .invoice-toolbar { display: none !important; }
          .invoice-paper { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          @page { margin: 0.6in; size: letter; }
        }
      `}</style>
    </div>
  )
}

function StatusPill({ status, amountPaid, amountDue }: { status: string; amountPaid: number; amountDue: number }) {
  let label = status
  let cls = 'bg-gray-100 text-gray-700'
  if (status === 'paid' || (amountDue === 0 && amountPaid > 0)) {
    label = 'Paid'
    cls = 'bg-green-100 text-green-800'
  } else if (status === 'open') {
    label = 'Open'
    cls = 'bg-amber-100 text-amber-800'
  } else if (status === 'void' || status === 'uncollectible') {
    label = status === 'void' ? 'Void' : 'Uncollectible'
    cls = 'bg-red-100 text-red-800'
  } else if (status === 'draft') {
    label = 'Draft'
  }
  return <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

function money(cents: number, currency: string) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: currency.toUpperCase() })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
