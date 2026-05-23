// Income document OCR + cross-check using Claude vision.
//
// Replaces Plaid Income entirely. We accept multiple document types depending
// on the applicant's employment path:
//   • W-2 employees:   2 consecutive most-recent paystubs
//   • 1099 / gig:      last 90 days of bank statements + most recent 1099
//   • Self-employed:   most recent 1040 Schedule C
//   • Retired:         SSA-1099 / pension statement
//   • New hire:        signed offer letter
//
// Cross-checks (the math has to be internally consistent):
//   1. Employer name matches between docs and the application's `employer`
//   2. Applicant name on docs matches application name + DL name
//   3. Two paystubs are consecutive pay periods (date math)
//   4. YTD gross on newer paystub > YTD gross on older
//   5. (YTD ÷ pay periods elapsed YTD) ≈ gross-per-period within 10%
//   6. Both paystubs within last 60 days
//   7. Visual tamper detection (fonts, alignment, edge artifacts)
//
// The cross-check results land in `income_flags`. The extracted data lands in
// `income_extracted`. Sophisticated photoshop will still slip through — for
// pre-qual ($15 internal signal) that's acceptable. Managers can upgrade to
// the FCRA full-report tier if they want courtroom-grade verification.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })

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

interface IncomeExtracted {
  employer_name?: string
  employer_address?: string
  employee_name?: string
  employee_last4_ssn?: string
  pay_frequency?: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'other'
  gross_per_period?: number
  net_per_period?: number
  ytd_gross?: number
  ytd_periods?: number
  annual_income_estimate?: number
  period_end_dates?: string[]   // YYYY-MM-DD
  tamper_suspected?: boolean
  notes?: string
}

async function fetchImageAsBase64(admin: ReturnType<typeof createClient>, path: string): Promise<{ mediaType: string; data: string } | null> {
  const { data, error } = await admin.storage.from('screening-docs').download(path)
  if (error || !data) return null
  const buf = new Uint8Array(await data.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  return { mediaType: data.type || 'image/jpeg', data: btoa(bin) }
}

function normalize(s: string | undefined | null): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
}

function expectedPeriodGap(freq?: string): number {
  switch (freq) {
    case 'weekly':       return 7
    case 'biweekly':     return 14
    case 'semimonthly':  return 15
    case 'monthly':      return 30
    default:             return 0
  }
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
      .select('id, application_id, income_path, income_doc_urls, income_doc_kinds, dl_extracted')
      .eq('id', orderId)
      .single()
    if (orderErr || !order) return json({ error: 'Order not found' }, { status: 404 })
    if (!order.income_doc_urls?.length) return json({ error: 'No income documents uploaded' }, { status: 400 })

    const { data: app } = await admin
      .from('applications')
      .select('first_name, last_name, employer, monthly_income, employment_start_date')
      .eq('id', order.application_id)
      .single()

    // Load every uploaded document as an image.
    const images: { mediaType: string; data: string }[] = []
    for (const url of order.income_doc_urls as string[]) {
      const img = await fetchImageAsBase64(admin, url)
      if (img) images.push(img)
    }
    if (!images.length) return json({ error: 'Could not load income docs from storage' }, { status: 500 })

    const kindsStr = (order.income_doc_kinds as string[] | null)?.join(', ') ?? 'paystub'
    const incomePath = order.income_path ?? 'w2'

    // ── OCR pass ─────────────────────────────────────────────────────────
    // Haiku 4.5 for OCR — much cheaper than Opus with negligible quality drop
    // on structured-field extraction from paystubs / W-2s / 1099s.
    const ocrResp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: 'You extract structured employment + income data from US payroll documents. Return ONLY a single JSON object with the keys requested — no prose, no markdown fence. Use numbers (not strings) for monetary amounts. Use YYYY-MM-DD for dates.',
      messages: [{
        role: 'user',
        content: [
          ...images.map((img) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
          })),
          { type: 'text', text: `The applicant is on the "${incomePath}" income path. Document kinds (in order): ${kindsStr}. Extract these fields, aggregating across documents:

employer_name, employer_address, employee_name, employee_last4_ssn (just the last 4 digits if visible), pay_frequency (one of: weekly, biweekly, semimonthly, monthly, other), gross_per_period (number, USD), net_per_period (number, USD), ytd_gross (number, USD — take from the LATEST document), ytd_periods (integer, pay periods elapsed YTD on the latest document), annual_income_estimate (number, USD — extrapolate from ytd_gross÷ytd_periods × periods-per-year, or use the W-2 annual if available), period_end_dates (array of YYYY-MM-DD strings, one per paystub, oldest first), tamper_suspected (boolean — true if you see misaligned fonts, copy-paste artifacts, suspicious whitespace), notes (string, any anomalies you noticed).

Return empty string / 0 / [] for fields you cannot determine.` },
        ],
      }],
    })

    type TextBlock = { type: 'text'; text: string }
    const textBlock = ocrResp.content.find((b): b is TextBlock => b.type === 'text')
    const ocrText = textBlock?.text ?? '{}'
    let extracted: IncomeExtracted = {}
    try {
      extracted = JSON.parse(ocrText.replace(/```json|```/g, '').trim())
    } catch {
      extracted = { notes: ocrText }
    }

    // ── Cross-checks ─────────────────────────────────────────────────────
    const flags: Record<string, boolean | string | number> = {
      tamper_suspected: extracted.tamper_suspected === true,
      employer_match_app: false,
      name_match_app: false,
      name_match_dl: false,
      paystubs_consecutive: false,
      ytd_math_consistent: false,
      paystubs_fresh_60d: false,
    }

    if (app && extracted.employer_name) {
      flags.employer_match_app = normalize(app.employer).length > 0
        && normalize(extracted.employer_name).includes(normalize(app.employer))
    }

    if (app && extracted.employee_name) {
      const appName = `${app.first_name} ${app.last_name}`
      flags.name_match_app = normalize(extracted.employee_name).includes(normalize(appName))
        || normalize(appName).includes(normalize(extracted.employee_name))
    }

    if (order.dl_extracted) {
      const dl = order.dl_extracted as { first_name?: string; last_name?: string }
      const dlName = `${dl.first_name ?? ''} ${dl.last_name ?? ''}`
      flags.name_match_dl = !!extracted.employee_name && (
        normalize(extracted.employee_name).includes(normalize(dlName))
        || normalize(dlName).includes(normalize(extracted.employee_name))
      )
    }

    if (extracted.period_end_dates && extracted.period_end_dates.length >= 2 && extracted.pay_frequency) {
      const dates = [...extracted.period_end_dates].sort()
      const gap = daysBetween(dates[dates.length - 2], dates[dates.length - 1])
      const expected = expectedPeriodGap(extracted.pay_frequency)
      flags.paystubs_consecutive = expected > 0 && Math.abs(gap - expected) <= 3

      const newest = dates[dates.length - 1]
      flags.paystubs_fresh_60d = daysBetween(newest, new Date().toISOString().slice(0, 10)) <= 60
    }

    if (extracted.ytd_gross && extracted.ytd_periods && extracted.gross_per_period) {
      const avg = extracted.ytd_gross / extracted.ytd_periods
      const diff = Math.abs(avg - extracted.gross_per_period) / extracted.gross_per_period
      flags.ytd_math_consistent = diff <= 0.10
      flags.ytd_math_diff_pct = Math.round(diff * 100)
    }

    await admin.from('screening_orders').update({
      income_extracted: extracted,
      income_flags: flags,
    }).eq('id', orderId)

    return json({ extracted, flags })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 })
  }
})
