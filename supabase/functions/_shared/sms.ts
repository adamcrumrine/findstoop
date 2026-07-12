// Plain SMS via the Twilio Messages API (the Verify service used for OTP
// can't send arbitrary text). Honors the profile's notification_sms_enabled
// flag and requires a phone on file — callers just pass the profile id.
//
// Required secrets (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN already exist for
// Verify):
//   TWILIO_FROM_NUMBER — an SMS-capable Twilio number in E.164 form
//                        ("+16145551234"). Without it, sends are skipped —
//                        SMS is a best-effort layer on top of email.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_FROM_NUMBER = Deno.env.get('TWILIO_FROM_NUMBER') ?? ''

/** Very light US-centric normalization: digits → +1XXXXXXXXXX. */
function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (phone.startsWith('+') && digits.length >= 10) return `+${digits}`
  return null
}

/**
 * Send `body` to the profile's phone if they opted into SMS. Fail-soft:
 * SMS never breaks the calling workflow — email is the guaranteed channel.
 */
export async function sendSmsIfEnabled(
  admin: SupabaseClient,
  profileId: string,
  body: string,
): Promise<'sent' | 'skipped' | 'failed'> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) return 'skipped'

  const { data } = await admin
    .from('profiles')
    .select('phone, notification_sms_enabled')
    .eq('id', profileId)
    .maybeSingle()
  if (!data?.notification_sms_enabled || !data.phone) return 'skipped'
  const to = toE164(data.phone)
  if (!to) return 'skipped'

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER, Body: body }),
      },
    )
    return res.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}
