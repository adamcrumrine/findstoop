// verify-backup-code/index.ts
// Verifies a single-use MFA backup code for the authenticated user.
// Codes are stored as SHA-256 hashes; the plain code is hashed server-side for comparison.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.toLowerCase().replace(/\s+/g, '')))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { code } = await req.json() as { code: string }
    if (!code?.trim()) {
      return new Response(JSON.stringify({ error: 'No code provided' }), { status: 400, headers: corsHeaders })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // Fetch all unused backup codes for this user
    const { data: codes, error: fetchErr } = await supabase
      .from('backup_codes')
      .select('id, code_hash')
      .eq('user_id', user.id)
      .is('used_at', null)

    if (fetchErr) throw new Error(fetchErr.message)
    if (!codes || codes.length === 0) {
      return new Response(JSON.stringify({ error: 'No backup codes on file' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const hash = await sha256Hex(code.trim())
    const match = codes.find((c) => c.code_hash === hash)

    if (!match) {
      return new Response(JSON.stringify({ error: 'Invalid backup code' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Mark the matched code as used
    const { error: updateErr } = await supabase
      .from('backup_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', match.id)

    if (updateErr) throw new Error(updateErr.message)

    // Count remaining unused codes
    const { count, error: countErr } = await supabase
      .from('backup_codes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('used_at', null)

    if (countErr) throw new Error(countErr.message)

    return new Response(
      JSON.stringify({ success: true, remaining: count ?? 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
