// AI triage for a maintenance request. Reads the title/description (+ the first
// photo if any) and asks Claude to categorize it, suggest a priority, summarize
// it, and recommend DIY-vs-call-a-pro. Stores the result on the row.
//
// Auth: the caller must be the tenant on the request OR the manager of the
// unit's property. Advisory only — it writes ai_* fields and NEVER overwrites
// the manager's own priority/status.

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, anthropicCost, timed } from '../_shared/logging.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
const MODEL = 'claude-haiku-4-5-20251001'

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

const CATEGORIES = ['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'pest', 'locks_security', 'landscaping', 'general']
const PRIORITIES = ['low', 'medium', 'high', 'emergency']

async function fetchImageAsBase64(url: string): Promise<{ mediaType: string; data: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]
    if (!ct.startsWith('image/')) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.length > 5_000_000) return null // skip very large images
    let bin = ''
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
    return { mediaType: ct, data: btoa(bin) }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { requestId } = await req.json() as { requestId?: string }
    if (!requestId) return json({ error: 'requestId required' }, { status: 400 })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Unauthorized' }, { status: 401 })

    const { data: reqRow, error: rErr } = await admin
      .from('maintenance_requests')
      .select('id, unit_id, tenant_id, title, description, images')
      .eq('id', requestId)
      .single()
    if (rErr || !reqRow) return json({ error: 'Request not found' }, { status: 404 })

    // Authorize: tenant on the request, or manager of the unit's property.
    let allowed = reqRow.tenant_id === user.id
    if (!allowed) {
      const { data: unit } = await admin.from('units').select('property_id').eq('id', reqRow.unit_id).single()
      if (unit) {
        const { data: prop } = await admin.from('properties').select('manager_id').eq('id', unit.property_id).single()
        allowed = prop?.manager_id === user.id
      }
    }
    if (!allowed) return json({ error: 'Forbidden' }, { status: 403 })

    if (!Deno.env.get('ANTHROPIC_API_KEY')) {
      return json({ error: 'AI not configured' }, { status: 500 })
    }

    // deno-lint-ignore no-explicit-any
    const content: any[] = [{
      type: 'text',
      text:
        `You are triaging a rental maintenance request for a property manager.\n` +
        `Title: ${reqRow.title}\n` +
        `Description: ${reqRow.description ?? '(none provided)'}\n\n` +
        `Reply with ONLY a JSON object (no prose, no markdown) with these keys:\n` +
        `- category: one of ${CATEGORIES.join(', ')}\n` +
        `- priority: one of ${PRIORITIES.join(', ')}. Use "emergency" only for an active safety hazard ` +
        `(gas smell, major water leak/flooding, exposed live electrical, no heat in freezing weather, fire/CO).\n` +
        `- summary: one concise sentence a busy manager can scan.\n` +
        `- recommendation: 1-2 sentences — is this likely a DIY/handyman fix or does it need a licensed pro, ` +
        `plus any immediate step the tenant should take.`,
    }]

    const firstImg = Array.isArray(reqRow.images) ? reqRow.images[0] : null
    if (firstImg) {
      const img = await fetchImageAsBase64(firstImg)
      if (img) content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } })
    }

    const { result: msg, latency_ms } = await timed(() => anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content }],
    }))

    // deno-lint-ignore no-explicit-any
    const textBlock = (msg.content as any[]).find((c) => c.type === 'text')
    const text: string = textBlock?.text ?? '{}'
    const m = text.match(/\{[\s\S]*\}/)
    // deno-lint-ignore no-explicit-any
    let parsed: any = {}
    try { parsed = JSON.parse(m ? m[0] : text) } catch { /* leave defaults */ }

    const category = CATEGORIES.includes(parsed.category) ? parsed.category : 'general'
    const priority = PRIORITIES.includes(parsed.priority) ? parsed.priority : null
    const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 300) : null
    const recommendation = typeof parsed.recommendation === 'string' ? parsed.recommendation.slice(0, 500) : null

    await admin.from('maintenance_requests').update({
      ai_category: category,
      ai_suggested_priority: priority,
      ai_summary: summary,
      ai_recommendation: recommendation,
      ai_triaged_at: new Date().toISOString(),
    }).eq('id', requestId)

    await logApiCall({
      function_name: 'triage-maintenance', vendor: 'anthropic', latency_ms,
      reference_id: requestId,
      cost_cents: anthropicCost(MODEL, msg.usage?.input_tokens ?? 0, msg.usage?.output_tokens ?? 0),
    })

    return json({ ok: true, triage: { category, priority, summary, recommendation } })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
})
