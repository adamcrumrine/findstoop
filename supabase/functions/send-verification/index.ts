// send-verification/index.ts
// Sends an SMS or voice OTP via Twilio Verify.
// Reads the user's phone number from their profiles row.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_ACCOUNT_SID    = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN     = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_VERIFY_SID     = Deno.env.get('TWILIO_VERIFY_SERVICE_SID')!
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { channel } = await req.json() as { channel: 'sms' | 'call' }

    // Auth: get user from JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    // Get user's phone number from profile
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .single()
    if (profileErr || !profile?.phone) {
      return new Response(JSON.stringify({ error: 'No phone number on file. Add a phone number in account settings first.' }), { status: 400, headers: corsHeaders })
    }

    // Call Twilio Verify API
    const params = new URLSearchParams({ To: profile.phone, Channel: channel })
    const twilioRes = await fetch(
      `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SID}/Verifications`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    )

    if (!twilioRes.ok) {
      const err = await twilioRes.json()
      // Bubble Twilio's diagnostic up to the UI — Twilio returns
      // human-readable messages like "Phone number ... is not a valid
      // mobile phone number" or "Max send attempts reached".
      return new Response(
        JSON.stringify({
          error: err.message ?? 'Twilio error',
          twilio_code:    err.code ?? null,
          http_status:    twilioRes.status,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const sent = await twilioRes.json()
    return new Response(
      JSON.stringify({ success: true, sid: sent.sid, status: sent.status, channel: sent.channel }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
