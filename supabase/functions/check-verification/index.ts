// check-verification/index.ts
// Verifies a Twilio Verify OTP code for the authenticated user.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_VERIFY_SID  = Deno.env.get('TWILIO_VERIFY_SERVICE_SID')!
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY  = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { code } = await req.json() as { code: string }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    // Get user's phone number
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .single()
    if (profileErr || !profile?.phone) {
      return new Response(JSON.stringify({ error: 'No phone number on file' }), { status: 400, headers: corsHeaders })
    }

    // Verify with Twilio
    const params = new URLSearchParams({ To: profile.phone, Code: code })
    const twilioRes = await fetch(
      `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SID}/VerificationChecks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    )

    const result = await twilioRes.json()
    if (result.status !== 'approved') {
      // Pass through Twilio's diagnostic so the UI can show why the code
      // didn't pass. Common values: 'pending' (wrong code), 'expired',
      // 'canceled', 'failed', or an error message + code from Twilio.
      return new Response(
        JSON.stringify({
          error: 'Incorrect code, please try again.',
          twilio_status: result.status ?? null,
          twilio_message: result.message ?? null,
          twilio_code:    result.code ?? null,
          http_status:    twilioRes.status,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
