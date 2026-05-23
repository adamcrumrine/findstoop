// Checkr webhook receiver — async report status updates.
//
// Checkr POSTs here when a report transitions through its lifecycle:
//   pending → consider | clear | suspended | dispute
//
// We verify the signature, then update the corresponding screening_order
// row by checkr_report_id.
//
// Deploy with `--no-verify-jwt` so Checkr (not a Supabase-authed user) can
// call it. Set the webhook URL in your Checkr Direct dashboard to:
//   https://<your-project>.functions.supabase.co/checkr-webhook
//
// Signature verification: Checkr signs payloads with HMAC-SHA256 using the
// webhook secret from your dashboard. Set CHECKR_WEBHOOK_SECRET in project
// secrets to match.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto as stdCrypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts'

const CHECKR_WEBHOOK_SECRET = Deno.env.get('CHECKR_WEBHOOK_SECRET') ?? ''

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

async function verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!CHECKR_WEBHOOK_SECRET || !signatureHeader) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(CHECKR_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
  const expected = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  // Constant-time compare
  if (expected.length !== signatureHeader.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const raw = await req.text()
  const signatureHeader = req.headers.get('X-Checkr-Signature')
  const ok = await verifySignature(raw, signatureHeader)
  if (!ok) return new Response('Invalid signature', { status: 401 })

  type CheckrEvent = {
    type?: string
    data?: { object?: { id?: string; status?: string; [k: string]: unknown } }
  }
  let event: CheckrEvent
  try {
    event = JSON.parse(raw)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  // Most Checkr events we care about are report.* — we look up the order by
  // checkr_report_id and patch checkr_data + transition the screening state
  // if the report has reached a terminal status.
  const obj = event.data?.object
  const reportId = obj?.id
  if (!reportId || !event.type?.startsWith('report.')) {
    // Acknowledge non-report events without action (candidate updates, etc.)
    return new Response('ok', { status: 200 })
  }

  const status = String(obj?.status ?? '')
  const terminal = ['clear', 'consider', 'suspended', 'dispute'].includes(status)

  await admin.from('screening_orders').update({
    checkr_data: obj,
    ...(terminal ? { state: 'complete', completed_at: new Date().toISOString() } : {}),
  }).eq('checkr_report_id', reportId)

  return new Response('ok', { status: 200 })
})
