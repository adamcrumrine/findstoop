// Shared instrumentation for edge functions.
//
// Two responsibilities:
//   1. Compute per-call vendor cost from token usage / known unit prices
//   2. Forward the result into the api_call_log table via the log_api_call RPC
//
// Failures here are silent — instrumentation must never break the call it
// is observing. Each helper catches its own errors and bails.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Vendor unit pricing (USD per token / per call) ──────────────────────
// Cents — fractional cents stored as NUMERIC(10,4) in api_call_log.

const ANTHROPIC_PRICES: Record<string, { in_per_m: number; out_per_m: number }> = {
  // Cents per 1M tokens
  'claude-opus-4-7':            { in_per_m: 1500, out_per_m: 7500 },
  'claude-sonnet-4-6':          { in_per_m:  300, out_per_m: 1500 },
  'claude-haiku-4-5-20251001':  { in_per_m:  100, out_per_m:  500 },
}

const STRIPE_PERCENT = 2.9         // 2.9% on each charge
const STRIPE_FIXED_CENTS = 30      // + $0.30

// Checkr Direct retail per criminal background pull — adjust as your
// account's wholesale rate firms up.
const CHECKR_PRICE_CENTS = 3500

export interface LogArgs {
  function_name: string
  vendor?: 'anthropic' | 'stripe' | 'checkr' | 'twilio' | 'resend' | 'supabase'
  status_code?: number
  latency_ms?: number
  cost_cents?: number
  user_id?: string | null
  reference_id?: string | null
  error_message?: string | null
  metadata?: Record<string, unknown>
}

/** Compute Anthropic cost from token usage. */
export function anthropicCost(model: string, input_tokens: number, output_tokens: number): number {
  const p = ANTHROPIC_PRICES[model]
  if (!p) return 0
  return (input_tokens / 1_000_000) * p.in_per_m + (output_tokens / 1_000_000) * p.out_per_m
}

/** Compute the Stripe fee on a given charge amount (cents → cents). */
export function stripeFee(amount_cents: number): number {
  return Math.round(amount_cents * (STRIPE_PERCENT / 100)) + STRIPE_FIXED_CENTS
}

export const CHECKR_COST_CENTS = CHECKR_PRICE_CENTS

/**
 * Fire-and-forget API-call log. Never throws.
 * Uses the SECURITY DEFINER `log_api_call` RPC so individual functions don't
 * need their own INSERT privileges on api_call_log.
 */
export async function logApiCall(args: LogArgs): Promise<void> {
  try {
    const admin: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    await admin.rpc('log_api_call', {
      p_function_name: args.function_name,
      p_vendor:        args.vendor ?? null,
      p_status_code:   args.status_code ?? 200,
      p_latency_ms:    args.latency_ms ?? null,
      p_cost_cents:    args.cost_cents ?? null,
      p_user_id:       args.user_id ?? null,
      p_reference_id:  args.reference_id ?? null,
      p_error_message: args.error_message ?? null,
      p_metadata:      args.metadata ?? null,
    })
  } catch {
    // Silent — instrumentation must never break the caller
  }
}

/**
 * Timer helper for instrumenting Anthropic SDK calls. Wraps a Promise and
 * extracts the token usage from the response to compute cost automatically.
 *
 * Usage:
 *   const { result, log } = await timed(() => anthropic.messages.create({...}))
 *   await logApiCall({
 *     function_name: 'dl-ocr', vendor: 'anthropic',
 *     latency_ms: log.latency_ms,
 *     cost_cents: anthropicCost(model, log.input_tokens, log.output_tokens),
 *   })
 */
export async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latency_ms: number; started_at: number }> {
  const started_at = Date.now()
  const result = await fn()
  return { result, latency_ms: Date.now() - started_at, started_at }
}
