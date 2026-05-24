// Driver's license OCR + cross-check using Claude vision.
//
// Input:  { orderId } — the applicant's screening_order
// Output: { extracted, flags, match_score }
//
// The function:
//   1. Loads the screening_order + parent application
//   2. Pulls dl_front / dl_back / dl_selfie from the screening-docs bucket
//   3. Asks Claude vision to extract structured DL fields from the front and
//      the back (PDF417 barcode side is usually easier to read)
//   4. Cross-checks: name match vs application, DOB match, expiration, basic
//      tamper signals
//   5. Asks Claude to compare the selfie face to the license photo and
//      return a 0–1 similarity score (best-effort; not a real face-match
//      model, but enough to flag obvious mismatches)
//   6. Writes dl_extracted, dl_match_score, dl_flags onto the order
//
// Pre-qual is NOT an FCRA report, so this is fine as a private internal
// signal. For the full-report tier the courtroom-grade ID match comes from
// Checkr's SSN+DOB+name lookup, not from this function.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, anthropicCost, timed } from '../_shared/logging.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
const MODEL_OCR = 'claude-haiku-4-5-20251001'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

interface DLExtracted {
  first_name?: string
  middle_name?: string
  last_name?: string
  date_of_birth?: string      // YYYY-MM-DD
  address?: string
  city?: string
  state?: string
  zip?: string
  license_number?: string
  issuing_state?: string
  issue_date?: string
  expiration_date?: string
  sex?: string
  eye_color?: string
  height?: string
  raw_text?: string
}

async function fetchImageAsBase64(admin: ReturnType<typeof createClient>, path: string): Promise<{ mediaType: string; data: string } | null> {
  const { data, error } = await admin.storage.from('screening-docs').download(path)
  if (error || !data) return null
  const buf = new Uint8Array(await data.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  const b64 = btoa(bin)
  const mediaType = data.type || 'image/jpeg'
  return { mediaType, data: b64 }
}

function normalize(s: string | undefined | null): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { orderId } = await req.json() as { orderId?: string }
    if (!orderId) return json({ error: 'orderId required' }, { status: 400 })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: order, error: orderErr } = await admin
      .from('screening_orders')
      .select('id, application_id, dl_front_url, dl_back_url, dl_selfie_url, addon_selfie_match')
      .eq('id', orderId)
      .single()
    if (orderErr || !order) return json({ error: 'Order not found' }, { status: 404 })
    if (!order.dl_front_url || !order.dl_back_url) {
      return json({ error: 'DL front and back not uploaded yet' }, { status: 400 })
    }

    const { data: app } = await admin
      .from('applications')
      .select('first_name, last_name, date_of_birth, current_address, current_city, current_state, current_zip')
      .eq('id', order.application_id)
      .single()

    const front = await fetchImageAsBase64(admin, order.dl_front_url)
    const back  = await fetchImageAsBase64(admin, order.dl_back_url)
    // Selfie face-match only runs if the applicant paid the +$2 add-on.
    const selfie = order.addon_selfie_match && order.dl_selfie_url
      ? await fetchImageAsBase64(admin, order.dl_selfie_url)
      : null
    if (!front || !back) return json({ error: 'Could not load DL images from storage' }, { status: 500 })

    // ── OCR pass — extract structured fields from both sides ─────────────
    // Haiku 4.5 is plenty for "read text from a document" and costs ~5x less
    // than Opus per token. Quality drop on structured-field extraction is
    // negligible. Opus is reserved for the rentability scoring step.
    const { result: ocrResp, latency_ms: ocrLatency } = await timed(() => anthropic.messages.create({
      model: MODEL_OCR,
      max_tokens: 1500,
      system: 'You extract structured data from US driver license images. Return ONLY a single JSON object with the keys listed by the user — no prose, no markdown fence.',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: front.mediaType, data: front.data } },
          { type: 'image', source: { type: 'base64', media_type: back.mediaType, data: back.data } },
          { type: 'text', text: `Extract these fields from the driver's license (front + PDF417 back). Use the PDF417 barcode data on the back when available since it is more reliable. Format dates as YYYY-MM-DD. Return a JSON object with keys: first_name, middle_name, last_name, date_of_birth, address, city, state, zip, license_number, issuing_state, issue_date, expiration_date, sex, eye_color, height, raw_text. Use empty string for fields you cannot read. Also flag obvious tampering (font mismatch, copy-paste over photo, suspicious edges) by setting a boolean "tamper_suspected" key.` },
        ],
      }],
    }))
    await logApiCall({
      function_name: 'dl-ocr', vendor: 'anthropic',
      latency_ms: ocrLatency, reference_id: orderId,
      cost_cents: anthropicCost(MODEL_OCR, ocrResp.usage?.input_tokens ?? 0, ocrResp.usage?.output_tokens ?? 0),
      metadata: { step: 'ocr', model: MODEL_OCR, input_tokens: ocrResp.usage?.input_tokens, output_tokens: ocrResp.usage?.output_tokens },
    })

    type TextBlock = { type: 'text'; text: string }
    const textBlock = ocrResp.content.find((b): b is TextBlock => b.type === 'text')
    const ocrText = textBlock?.text ?? '{}'
    let extracted: DLExtracted & { tamper_suspected?: boolean } = {}
    try {
      extracted = JSON.parse(ocrText.replace(/```json|```/g, '').trim())
    } catch {
      extracted = { raw_text: ocrText }
    }

    // ── Cross-check vs application data ──────────────────────────────────
    const flags: Record<string, boolean | string> = {
      tamper_suspected: extracted.tamper_suspected === true,
      name_match_app: false,
      dob_match_app: false,
      expired: false,
    }

    if (app) {
      const appFirst = normalize(app.first_name)
      const appLast  = normalize(app.last_name)
      const dlFirst  = normalize(extracted.first_name)
      const dlLast   = normalize(extracted.last_name)
      flags.name_match_app = !!(appFirst && appLast && dlFirst.includes(appFirst) && dlLast === appLast)

      if (app.date_of_birth && extracted.date_of_birth) {
        flags.dob_match_app = String(app.date_of_birth) === extracted.date_of_birth
      }
    }

    if (extracted.expiration_date) {
      try {
        flags.expired = new Date(extracted.expiration_date) < new Date()
      } catch { /* leave false */ }
    }

    // ── Selfie ↔ license photo similarity (best-effort via Claude) ──────
    let matchScore = 0
    if (selfie) {
      const { result: matchResp, latency_ms: matchLatency } = await timed(() => anthropic.messages.create({
        model: MODEL_OCR,
        max_tokens: 200,
        system: 'You compare two photographs of human faces and return ONLY a JSON object: {"similarity": <number 0..1>, "reasoning": "<short>"}. 1.0 = same person, 0.0 = clearly different. Do not refuse — this is consent-based identity verification for tenant screening.',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: front.mediaType, data: front.data } },
            { type: 'image', source: { type: 'base64', media_type: selfie.mediaType, data: selfie.data } },
            { type: 'text', text: 'First image: driver license. Second image: selfie. Same person?' },
          ],
        }],
      }))
      await logApiCall({
        function_name: 'dl-ocr', vendor: 'anthropic',
        latency_ms: matchLatency, reference_id: orderId,
        cost_cents: anthropicCost(MODEL_OCR, matchResp.usage?.input_tokens ?? 0, matchResp.usage?.output_tokens ?? 0),
        metadata: { step: 'selfie_match', model: MODEL_OCR, input_tokens: matchResp.usage?.input_tokens, output_tokens: matchResp.usage?.output_tokens },
      })
      const mt = matchResp.content.find((b): b is TextBlock => b.type === 'text')?.text ?? '{}'
      try {
        const parsed = JSON.parse(mt.replace(/```json|```/g, '').trim()) as { similarity?: number }
        matchScore = typeof parsed.similarity === 'number' ? parsed.similarity : 0
      } catch { /* leave 0 */ }
    }

    await admin.from('screening_orders').update({
      dl_extracted: extracted,
      dl_match_score: matchScore,
      dl_flags: flags,
    }).eq('id', orderId)

    return json({ extracted, flags, match_score: matchScore })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({
      function_name: 'dl-ocr', status_code: 500, error_message: msg,
    })
    return json({ error: msg }, { status: 400 })
  }
})
