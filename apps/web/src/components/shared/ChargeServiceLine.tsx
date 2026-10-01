import toast from 'react-hot-toast'
import { Paperclip } from 'lucide-react'
import { formatServicePeriod } from '@findstoop/shared/lib/format'
import { getSignedUrl } from '@findstoop/shared/api/documents'
import type { Payment } from '@findstoop/shared/types/payment'
import { supabase } from '../../lib/supabase'

// "Service Jul 1 – Jul 31, 2026 · View bill" under a bill-back charge.
//
// Shared by the landlord's ledger and every tenant surface that lists the
// charge, so both sides see the same window and the same bill. Renders
// nothing for charges without either (rent, pet rent, one-offs).
export default function ChargeServiceLine({ payment, className = 'text-xs text-gray-500' }: {
  payment: Pick<Payment, 'service_period_start' | 'service_period_end' | 'attachment_document_id'>
  className?: string
}) {
  const period = formatServicePeriod(payment.service_period_start, payment.service_period_end)
  const docId = payment.attachment_document_id
  if (!period && !docId) return null

  const openBill = async (e: React.MouseEvent) => {
    // Rows this sits in are sometimes clickable or inside a <label>; the
    // link is its own action.
    e.preventDefault()
    e.stopPropagation()
    // Open the tab synchronously, then point it at the signed URL: Safari
    // blocks window.open once an await has run.
    const tab = window.open('', '_blank')
    try {
      const { data, error } = await supabase
        .from('documents').select('storage_url').eq('id', docId!).single()
      if (error || !data) throw new Error(error?.message ?? 'not found')
      const url = await getSignedUrl(data.storage_url)
      if (tab) tab.location.href = url
      else window.location.href = url
    } catch {
      tab?.close()
      toast.error("Couldn't open the bill. Please try again.")
    }
  }

  return (
    <p className={className}>
      {period && <>Service {period}</>}
      {period && docId && ' · '}
      {docId && (
        <button type="button" onClick={openBill}
          className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:no-underline">
          <Paperclip className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
          View bill
        </button>
      )}
    </p>
  )
}
