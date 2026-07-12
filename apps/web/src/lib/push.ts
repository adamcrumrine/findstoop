// Client-side web push: subscribe/unsubscribe this browser and keep the
// subscription in push_subscriptions (RLS: owner-scoped). The service worker
// side lives in public/push-sw.js; sending happens in edge functions.

import { supabase } from './supabase'

// VAPID public key — public by definition (it ships to every browser); the
// matching private key is a Supabase edge-function secret (VAPID_PRIVATE_KEY).
export const VAPID_PUBLIC_KEY =
  'BPDO6ZCDghJNdACN3i4x1BHfuPyocspgja4RnzcbA2IkBf_DUdZWhbbquPJGZs3Fdee-hFkzTcUQ8ZeP7IG4rS0'

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

/** Is THIS browser currently subscribed? */
export async function pushSubscribed(): Promise<boolean> {
  const reg = await registration()
  if (!reg) return false
  return !!(await reg.pushManager.getSubscription())
}

/**
 * Ask permission and subscribe this browser, persisting the subscription.
 * Returns 'subscribed' | 'denied' | 'unsupported' | 'error'.
 */
export async function subscribePush(profileId: string): Promise<'subscribed' | 'denied' | 'unsupported' | 'error'> {
  if (!pushSupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.ready
  try {
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
      }))
    const json = sub.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'error'
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        profile_id: profileId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 255),
      },
      { onConflict: 'endpoint' },
    )
    if (error) return 'error'
    return 'subscribed'
  } catch {
    return 'error'
  }
}

/** Unsubscribe this browser and remove its row. */
export async function unsubscribePush(): Promise<void> {
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => undefined)
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}
