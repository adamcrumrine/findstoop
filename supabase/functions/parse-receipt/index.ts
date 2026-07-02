// parse-receipt — AI receipt-to-expense capture for landlords.
//
// A manager photographs a purchase receipt (Home Depot run, plumber invoice,
// utility bill) and this function extracts { vendor, date, total_amount,
// suggested_category, line_summary, confidence } so the Expenses page can
// prefill the add-expense form. The landlord always reviews before saving —
// nothing is auto-inserted, and the image itself is parse-and-discard (no
// storage write; property_expenses has no receipt/attachment column).
//
// Auth / response / rate-limit conventions mirror ask-lease + self-triage:
// bearer → getUser → role check (manager or admin here, since expenses are a
// manager tool); expected user-facing outcomes as HTTP 200 { ok: false, code };
// per-user daily cap via the rate_limit_check RPC. Vision + logging shape
// mirrors income-ocr / dl-ocr: same Haiku model, base64 image blocks, forced
// JSON, logApiCall with anthropicCost + timed. Never log receipt contents —
// only sizes / latency / cost / shape metadata.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, anthropicCost, timed } from '../_shared/logging.ts'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
// Same OCR model as income-ocr / dl-ocr / credit-report-ocr — Haiku 4.5 is
// plenty for structured-field extraction from a photographed document.
const MODEL_OCR = 'claude-haiku-4-5-20251001'

const MAX_OUTPUT_TOKENS = 600
// Anthropic's per-image cap is 5 MB decoded; base64 inflates ~4/3, so cap the
// encoded string accordingly (same guard style as explain-lease's PDF cap).
// The client downscales to ~1568px JPEG first, so real payloads are ~100-400 KB.
const MAX_B64_LEN = 6_800_000
// ~30 scans per manager per day — a heavy tax-season session is 10-20; caps abuse spend.
const DAILY_LIMIT = 30

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type AllowedMediaType = typeof ALLOWED_MEDIA_TYPES[number]

// Must stay in sync with the expense_category enum
// (migration 20260530000001) / ExpenseCategory in packages/shared.
const EXPENSE_CATEGORIES = [
  'advertising', 'auto_travel', 'cleaning_maintenance', 'commissions',
  'insurance', 'legal_professional', 'management_fees', 'mortgage_interest',
  'other_interest', 'repairs', 'supplies', 'taxes', 'utilities',
  'depreciation', 'other',
] as const
type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]

interface ParseReceiptInput {
  image_base64?: string
  media_type?: string
}

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

const SYSTEM_PROMPT = `
You extract structured expense data from photographed purchase receipts and invoices for a rental-property landlord's bookkeeping. Return ONLY a single JSON object — no prose, no markdown fence.

Keys:
- is_receipt: boolean — true only if the image is a purchase receipt, invoice, or bill showing an amount paid or due. False for anything else (random photos, screenshots of apps, menus, documents that aren't bills).
- vendor: string — the merchant / payee name as printed (e.g. "The Home Depot", "ABC Plumbing"). Empty string if unreadable.
- date: string — the transaction date as YYYY-MM-DD. Empty string if unreadable.
- total_amount: number — the final total paid in USD (after tax; prefer "Total" over "Subtotal"). 0 if unreadable.
- suggested_category: one of exactly: advertising, auto_travel, cleaning_maintenance, commissions, insurance, legal_professional, management_fees, mortgage_interest, other_interest, repairs, supplies, taxes, utilities, depreciation, other. These map to Schedule E expense lines. Guidance: hardware-store materials for fixing something (paint, lumber, plumbing parts, fixtures) → repairs; consumables and small general-purpose items (light bulbs, filters, batteries, tools kept on hand) → supplies; cleaning services or janitorial products → cleaning_maintenance; utility bills (electric, gas, water, trash, internet) → utilities; insurance premiums → insurance; attorney/accountant/inspection fees → legal_professional; property tax bills → taxes; gas/mileage/parking for property trips → auto_travel; listing or ad costs → advertising; when genuinely unsure → other.
- line_summary: string — a short comma-separated gist of what was purchased, max ~8 words (e.g. "paint, rollers, caulk"). Empty string if items are unreadable.
- confidence: "high" | "medium" | "low" — high only when vendor, date, AND total are all clearly legible; medium when one is uncertain; low when the image is blurry, cropped, or you guessed.

Rules: never invent values — use the empty/zero defaults for anything you cannot actually read. The total must be the amount on the receipt, not a sum you computed.
`.trim()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Method not allowed' }, { status: 405 })

  try {
    // ── Auth: bearer token → user → manager/admin role ───────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(req, { ok: false, message: 'Unauthorized' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const admin: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json(req, { ok: false, message: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single()
    if (!profile) return json(req, { ok: false, message: 'Profile not found' }, { status: 404 })
    if (profile.role !== 'manager' && profile.role !== 'admin') {
      return json(req, { ok: false, message: 'This endpoint is for managers' }, { status: 403 })
    }

    // ── Input validation ─────────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as ParseReceiptInput
    const imageBase64 = (body.image_base64 ?? '').trim()
    const mediaType = (body.media_type ?? 'image/jpeg').trim().toLowerCase()

    if (!imageBase64) {
      return json(req, { ok: false, code: 'bad_input', message: 'No image provided.' })
    }
    if (imageBase64.length > MAX_B64_LEN) {
      return json(req, { ok: false, code: 'too_large', message: 'That image is too large — try a smaller photo.' })
    }
    if (!ALLOWED_MEDIA_TYPES.includes(mediaType as AllowedMediaType)) {
      return json(req, { ok: false, code: 'bad_input', message: 'Unsupported image format — use JPEG, PNG, GIF, or WebP.' })
    }

    // Per-user daily cap via the shared sliding-window rate limiter (same
    // rate_limit_check RPC ask-lease / self-triage use, keyed by user).
    const allowed = await checkRateLimit({ key: `parse-receipt:${user.id}`, windowSeconds: 86400, maxCount: DAILY_LIMIT })
    if (!allowed) {
      return json(req, { ok: false, code: 'rate_limited', message: 'Too many receipt scans today — you can still add expenses manually.' })
    }

    if (!Deno.env.get('ANTHROPIC_API_KEY')) {
      return json(req, { ok: false, code: 'unavailable', message: 'AI not configured' })
    }

    // ── OCR pass — JSON forced the same way income-ocr / dl-ocr do ───────
    const { result: ocrResp, latency_ms } = await timed(() => anthropic.messages.create({
      model: MODEL_OCR,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType as AllowedMediaType, data: imageBase64 } },
          { type: 'text', text: 'Extract the expense fields from this receipt photo. Return the JSON object only.' },
        ],
      }],
    }))

    type TextBlock = { type: 'text'; text: string }
    const textBlock = ocrResp.content.find((b): b is TextBlock => b.type === 'text')
    const ocrText = textBlock?.text ?? '{}'
    const m = ocrText.match(/\{[\s\S]*\}/)
    // deno-lint-ignore no-explicit-any
    let parsed: any = {}
    try { parsed = JSON.parse(m ? m[0] : ocrText.replace(/```json|```/g, '').trim()) } catch { /* leave defaults */ }

    // ── Validate hard — never trust model output shape ───────────────────
    const isReceipt = parsed.is_receipt === true

    const vendor = typeof parsed.vendor === 'string' && parsed.vendor.trim()
      ? parsed.vendor.trim().slice(0, 120)
      : null

    // Date: strict YYYY-MM-DD, must parse, and must be sane — no future dates
    // (beyond a 1-day timezone cushion) and nothing before 2000.
    let date: string | null = null
    if (typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
      const t = new Date(parsed.date + 'T00:00:00Z').getTime()
      const min = Date.UTC(2000, 0, 1)
      const max = Date.now() + 86400000
      if (!Number.isNaN(t) && t >= min && t <= max) date = parsed.date
    }

    // Amount: positive finite number, 2dp, sanity-capped at $1M.
    const rawAmount = typeof parsed.total_amount === 'number' ? parsed.total_amount : NaN
    const total_amount = Number.isFinite(rawAmount) && rawAmount > 0 && rawAmount < 1_000_000
      ? Math.round(rawAmount * 100) / 100
      : null

    // Category: must be in the enum, else null (the client keeps its default).
    const suggested_category: ExpenseCategory | null =
      typeof parsed.suggested_category === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(parsed.suggested_category)
        ? parsed.suggested_category as ExpenseCategory
        : null

    const line_summary = typeof parsed.line_summary === 'string' && parsed.line_summary.trim()
      ? parsed.line_summary.trim().slice(0, 160)
      : null

    // Default to low — when in doubt the landlord should double-check.
    const confidence: 'high' | 'medium' | 'low' =
      parsed.confidence === 'high' || parsed.confidence === 'medium' ? parsed.confidence : 'low'

    await logApiCall({
      function_name: 'parse-receipt',
      vendor: 'anthropic',
      latency_ms,
      cost_cents: anthropicCost(MODEL_OCR, ocrResp.usage?.input_tokens ?? 0, ocrResp.usage?.output_tokens ?? 0),
      user_id: user.id,
      // Never log receipt contents — only size/shape metadata.
      metadata: {
        model: MODEL_OCR,
        input_tokens: ocrResp.usage?.input_tokens,
        output_tokens: ocrResp.usage?.output_tokens,
        image_b64_length: imageBase64.length,
        is_receipt: isReceipt,
        confidence,
        has_vendor: !!vendor,
        has_date: !!date,
        has_amount: total_amount != null,
      },
    })

    if (!isReceipt) {
      return json(req, { ok: false, code: 'not_a_receipt', message: "That doesn't look like a receipt or invoice." })
    }
    if (!vendor && !date && total_amount == null) {
      // A "receipt" we couldn't read anything from is a parse failure.
      return json(req, { ok: false, code: 'unreadable', message: "Couldn't read that receipt — try a clearer photo." })
    }

    return json(req, {
      ok: true,
      receipt: { vendor, date, total_amount, suggested_category, line_summary, confidence },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({ function_name: 'parse-receipt', status_code: 500, error_message: msg })
    return json(req, { ok: false, message: 'Could not read that receipt.' }, { status: 500 })
  }
})
