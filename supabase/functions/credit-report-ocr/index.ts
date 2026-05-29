// Self-disclosed credit report OCR + authenticity scoring.
//
// The applicant pulled their own report from AnnualCreditReport.gov and
// uploaded it here. This function:
//   1. OCRs the PDF with Claude Haiku → structured facts (bureau, score,
//      report date, account counts, name/dob/address on the report).
//   2. Cross-references those facts against the verified ID + income docs
//      already on this screening_order, using Claude Sonnet for reasoning.
//   3. Emits an "authenticity score" 0–100 + a list of anomaly flags.
//
// IMPORTANT framing: this is NOT a bureau-issued report and NOT a credit
// check. It's the applicant's own disclosure with an AI consistency
// signal layered on top. The manager UI labels it accordingly.
//
// Risk model:
//   • Forgery — PDFs are trivially editable. Authenticity score helps;
//     it doesn't eliminate the risk. Tenant attestation + IP capture
//     shifts liability to the applicant if they alter the doc.
//   • Coverage — AnnualCreditReport doesn't include the FICO score by
//     default. We surface "score: not present" rather than guessing.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, anthropicCost, timed } from '../_shared/logging.ts'
import { tokensMatch } from '../_shared/screeningAuth.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
const MODEL_OCR = 'claude-haiku-4-5-20251001'
const MODEL_REASONING = 'claude-sonnet-4-6'

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

interface CreditExtracted {
  bureau?: 'equifax' | 'experian' | 'transunion' | 'unknown'
  report_date?: string                // YYYY-MM-DD as printed on the report
  score?: number | null               // FICO/VantageScore if printed; null if not
  score_model?: string | null         // e.g. 'FICO 8', 'VantageScore 3.0'
  consumer_name?: string
  consumer_dob?: string               // YYYY-MM-DD
  current_address?: string
  prior_addresses?: string[]
  account_count?: number
  open_account_count?: number
  closed_account_count?: number
  derogatory_count?: number           // late pays, collections, charge-offs
  collection_count?: number
  bankruptcy_count?: number
  total_balance?: number              // USD across reported tradelines
  oldest_account_opened?: string      // YYYY-MM
  tamper_signals?: string[]           // freeform list of anomalies the OCR pass noticed
  notes?: string
}

interface AuthenticityResult {
  authenticity_score: number          // 0-100
  flags: Array<{ severity: 'info' | 'low' | 'medium' | 'high'; code: string; message: string }>
  summary: string                     // 1-2 sentences for the manager
}

async function fetchPdfAsBase64(admin: ReturnType<typeof createClient>, path: string): Promise<{ data: string } | null> {
  const { data, error } = await admin.storage.from('screening-docs').download(path)
  if (error || !data) return null
  const buf = new Uint8Array(await data.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  return { data: btoa(bin) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { orderId, token } = await req.json() as { orderId?: string; token?: string }
    if (!orderId) return json({ error: 'orderId required' }, { status: 400 })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: order, error: orderErr } = await admin
      .from('screening_orders')
      .select(`
        id, application_id, credit_self_pdf_url,
        dl_extracted, income_extracted, access_token
      `)
      .eq('id', orderId)
      .single()
    if (orderErr || !order) return json({ error: 'Order not found' }, { status: 404 })
    if (!tokensMatch(token, order.access_token)) return json({ error: 'Forbidden' }, { status: 403 })
    if (!order.credit_self_pdf_url) return json({ error: 'No credit report uploaded' }, { status: 400 })

    const { data: app } = await admin
      .from('applications')
      .select('first_name, last_name, date_of_birth, current_address, current_city, current_state, current_zip, monthly_income, current_rent')
      .eq('id', order.application_id)
      .single()

    const pdf = await fetchPdfAsBase64(admin, order.credit_self_pdf_url)
    if (!pdf) return json({ error: 'Could not load PDF from storage' }, { status: 500 })

    // ── Pass 1: OCR with Haiku ──────────────────────────────────────────────
    // Claude vision accepts PDFs directly as `document` content blocks.
    const { result: ocrResp, latency_ms: ocrLatency } = await timed(() => anthropic.messages.create({
      model: MODEL_OCR,
      max_tokens: 2500,
      system: 'You extract structured facts from US consumer credit reports issued by Equifax, Experian, or TransUnion. Return ONLY a single JSON object — no prose, no markdown fence. Use numbers for counts and amounts. Use YYYY-MM-DD for full dates and YYYY-MM for "account opened" dates. Use null when a field is not present (especially the credit score, which AnnualCreditReport.gov reports often do NOT include).',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document' as const,
            source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: pdf.data },
          },
          { type: 'text', text: `Extract these fields from the attached credit report:

bureau (one of: equifax, experian, transunion, unknown), report_date (YYYY-MM-DD as printed on the cover or header), score (integer 300-850 if a FICO or VantageScore is printed, else null), score_model (e.g. "FICO 8", "VantageScore 3.0", or null), consumer_name (full name as printed), consumer_dob (YYYY-MM-DD), current_address (single line), prior_addresses (array of strings), account_count (total tradelines reported), open_account_count, closed_account_count, derogatory_count (late pays, collections, charge-offs, public records), collection_count, bankruptcy_count, total_balance (sum of current balances in USD), oldest_account_opened (YYYY-MM), tamper_signals (array of strings — note any anomalies: font drift, alignment issues, missing footer, suspicious page breaks, white-box overlays, inconsistent kerning, etc.), notes (any other context worth surfacing).

If the document is NOT a credit report from a major US bureau, set bureau="unknown" and put a clear explanation in notes.` },
        ],
      }],
    }))
    await logApiCall({
      function_name: 'credit-report-ocr',
      vendor: 'anthropic',
      latency_ms: ocrLatency,
      reference_id: orderId,
      cost_cents: anthropicCost(MODEL_OCR, ocrResp.usage?.input_tokens ?? 0, ocrResp.usage?.output_tokens ?? 0),
      metadata: { step: 'ocr', model: MODEL_OCR, input_tokens: ocrResp.usage?.input_tokens, output_tokens: ocrResp.usage?.output_tokens },
    })

    type TextBlock = { type: 'text'; text: string }
    const ocrText = ocrResp.content.find((b): b is TextBlock => b.type === 'text')?.text ?? '{}'
    let extracted: CreditExtracted = {}
    try {
      extracted = JSON.parse(ocrText.replace(/```json|```/g, '').trim())
    } catch {
      extracted = { notes: ocrText, bureau: 'unknown' }
    }

    // ── Pass 2: Cross-doc authenticity reasoning with Sonnet ────────────────
    // We hand Sonnet the OCR output + the verified facts from the rest of the
    // screening order and ask it to score consistency. The model reads JSON,
    // it doesn't need to re-see the PDF — cheaper + faster than another
    // vision call.
    const knownFacts = {
      application: app && {
        name: `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim(),
        dob: app.date_of_birth,
        address: [app.current_address, app.current_city, app.current_state, app.current_zip].filter(Boolean).join(', '),
        monthly_income: app.monthly_income,
        current_rent: app.current_rent,
      },
      drivers_license: order.dl_extracted ?? null,
      income_docs: order.income_extracted ?? null,
    }

    const { result: reasoningResp, latency_ms: reasoningLatency } = await timed(() => anthropic.messages.create({
      model: MODEL_REASONING,
      max_tokens: 1500,
      system: `You are an underwriter assessing whether an applicant-uploaded credit report PDF is consistent with the other documents the applicant has already provided. You DO NOT decide creditworthiness — only authenticity / consistency. Return ONLY a single JSON object matching this shape:

{
  "authenticity_score": <integer 0-100>,
  "flags": [
    { "severity": "info"|"low"|"medium"|"high", "code": "<short_snake_code>", "message": "<one sentence>" }
  ],
  "summary": "<one or two plain sentences for a small landlord>"
}

Scoring guide:
  • 90-100: All facts cross-check; report date is recent (<60 days); no tamper signals
  • 70-89:  Minor discrepancies (nickname vs full name, slightly stale date 60-180 days, one missing address)
  • 50-69:  Material discrepancies (name mismatch, DOB mismatch, address mismatch, stale > 180 days, OR OCR flagged tamper signals)
  • 0-49:   Strong indicators of tampering, wrong-person report, or non-credit-report document

Always include at least one flag explaining the score. Use severity:high for any name/DOB mismatch or detected tamper signal. Be specific and dollar-precise where applicable.`,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: `Credit report OCR result:
\`\`\`json
${JSON.stringify(extracted, null, 2)}
\`\`\`

Already-verified facts from the rest of the application:
\`\`\`json
${JSON.stringify(knownFacts, null, 2)}
\`\`\`

Today's date is ${new Date().toISOString().slice(0, 10)}.

Assess and return the JSON.` }],
      }],
    }))
    await logApiCall({
      function_name: 'credit-report-ocr',
      vendor: 'anthropic',
      latency_ms: reasoningLatency,
      reference_id: orderId,
      cost_cents: anthropicCost(MODEL_REASONING, reasoningResp.usage?.input_tokens ?? 0, reasoningResp.usage?.output_tokens ?? 0),
      metadata: { step: 'reasoning', model: MODEL_REASONING, input_tokens: reasoningResp.usage?.input_tokens, output_tokens: reasoningResp.usage?.output_tokens },
    })

    const reasoningText = reasoningResp.content.find((b): b is TextBlock => b.type === 'text')?.text ?? '{}'
    let authenticity: AuthenticityResult = { authenticity_score: 0, flags: [], summary: '' }
    try {
      authenticity = JSON.parse(reasoningText.replace(/```json|```/g, '').trim())
    } catch {
      authenticity = {
        authenticity_score: 0,
        flags: [{ severity: 'high', code: 'reasoning_parse_failed', message: 'Could not parse authenticity result; manager review required.' }],
        summary: 'Automated review failed to produce a structured result.',
      }
    }

    // Clamp + persist
    const score = Math.max(0, Math.min(100, Math.round(authenticity.authenticity_score ?? 0)))

    await admin.from('screening_orders').update({
      credit_self_bureau: extracted.bureau ?? 'unknown',
      credit_self_report_date: extracted.report_date ?? null,
      credit_self_extracted: extracted,
      credit_self_authenticity_score: score,
      credit_self_authenticity_flags: { flags: authenticity.flags, summary: authenticity.summary },
      credit_self_processed_at: new Date().toISOString(),
    }).eq('id', orderId)

    // Mirror the new facts into the anonymized analytics layer. Idempotent —
    // safe to call on every screening stage; the row merges on conflict.
    try {
      await admin.rpc('extract_application_analytics', { p_application_id: order.application_id })
    } catch {
      // Analytics extraction failures must never block the screening flow.
    }

    return json({
      extracted,
      authenticity_score: score,
      flags: authenticity.flags,
      summary: authenticity.summary,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({ function_name: 'credit-report-ocr', status_code: 500, error_message: msg })
    return json({ error: msg }, { status: 400 })
  }
})
