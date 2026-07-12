// Web-push sender for edge functions (Deno).
//
// Uses npm:web-push for the VAPID JWT + aes128gcm payload encryption — the
// same battle-tested library the Supabase push guide uses. Callers pass a
// service-role Supabase client; subscriptions whose endpoints the push
// service reports gone (404/410) are pruned so dead devices don't accumulate.
//
// Required function secrets:
//   VAPID_PRIVATE_KEY — pairs with the public key baked into the web client
//                       (apps/web/src/lib/push.ts). Set via
//                       `supabase secrets set VAPID_PRIVATE_KEY=…`.
//
// Payload contract matches public/push-sw.js: { title, body, url?, tag? }.

// @ts-expect-error npm: specifier — resolved by the Supabase Edge runtime.
import webpush from 'npm:web-push@3.6.7'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY =
  'BPDO6ZCDghJNdACN3i4x1BHfuPyocspgja4RnzcbA2IkBf_DUdZWhbbquPJGZs3Fdee-hFkzTcUQ8ZeP7IG4rS0'

export interface PushMessage {
  title: string
  body: string
  /** App path the notification opens, e.g. "/tenant/pay-rent". */
  url?: string
  /** Collapse key — later sends with the same tag replace earlier ones. */
  tag?: string
}

interface SubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

let vapidConfigured = false
function ensureVapid(): boolean {
  if (vapidConfigured) return true
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!privateKey) return false
  webpush.setVapidDetails('mailto:support@findstoop.com', VAPID_PUBLIC_KEY, privateKey)
  vapidConfigured = true
  return true
}

/**
 * Send a push message to every subscribed device of a profile.
 * Fail-soft by design: push is a best-effort channel layered on top of email —
 * a send failure must never break the calling workflow. Returns the number of
 * devices that accepted the message.
 */
export async function sendPushToProfile(
  supabase: SupabaseClient,
  profileId: string,
  message: PushMessage,
): Promise<number> {
  if (!ensureVapid()) return 0

  const { data } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('profile_id', profileId)
  const subs = (data ?? []) as SubscriptionRow[]
  if (subs.length === 0) return 0

  const payload = JSON.stringify(message)
  let delivered = 0

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        delivered++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // Gone / not found → the device unsubscribed; drop the row.
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
        // Anything else (throttling, transient) — swallow; email remains the
        // guaranteed channel.
      }
    }),
  )

  return delivered
}
