import { supabase } from '../lib/supabase'

/**
 * Calls the stripe-sync-quantity edge function to reconcile the current
 * landlord's subscription quantity with their active paid-unit count.
 *
 * Fire-and-forget by default: any error is swallowed silently. Drift left
 * over by a missed sync is surfaced on the Billing page with a manual
 * "Sync now" button as a fallback.
 *
 * Pass `{ throwOnError: true }` to opt into error propagation (e.g. on the
 * Billing page where you want a toast).
 */
export async function syncSubscriptionQuantity(opts: { throwOnError?: boolean } = {}): Promise<
  | { status: 'no_payment_needed'; paidUnits: number }
  | { status: 'subscribe_required'; paidUnits: number }
  | { status: 'updated'; paidUnits: number; previousQuantity: number }
  | { status: 'unchanged'; paidUnits: number }
  | { status: 'will_cancel'; paidUnits: number; previousQuantity: number }
  | { status: 'error'; error: string }
> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-sync-quantity', { body: {} })
    if (error) throw error
    return data
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sync failed'
    if (opts.throwOnError) throw err
    return { status: 'error', error: msg }
  }
}
