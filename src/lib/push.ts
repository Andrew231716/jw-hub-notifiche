import type { AppPreferences, PushSubscriptionJSON } from './types'
import { getCachedUpdates, getReadUrls } from './localStore'
import { getDeviceId } from './preferences'

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i)
  return arr
}

export function pushConfigured(): boolean {
  return Boolean(
    VAPID_PUBLIC &&
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window,
  )
}

function currentReadUrls(lang: string): string[] {
  const urls = getReadUrls(lang)
  for (const item of getCachedUpdates()) {
    if (item.read) urls.add(item.url)
  }
  return [...urls]
}

async function postSubscription(
  prefs: AppPreferences,
  subscription: PushSubscriptionJSON,
) {
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription,
      deviceId: getDeviceId(),
      language: prefs.language,
      categories: prefs.categories,
      quietHoursEnabled: prefs.quietHoursEnabled,
      quietStart: prefs.quietStart,
      quietEnd: prefs.quietEnd,
      frequency: prefs.frequency,
      readUrls: currentReadUrls(prefs.language),
    }),
  })
}

export async function subscribeToPush(
  prefs: AppPreferences,
): Promise<PushSubscriptionJSON | null> {
  if (!pushConfigured() || !VAPID_PUBLIC) return null
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    })
  }
  const json = sub.toJSON() as PushSubscriptionJSON
  await postSubscription(prefs, json)
  return json
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, deviceId: getDeviceId() }),
    })
  }
}

export async function syncPushPreferences(prefs: AppPreferences): Promise<void> {
  if (!pushConfigured()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await postSubscription(prefs, sub.toJSON() as PushSubscriptionJSON)
}

/** Tell the server these URLs are already read — skip Web Push for them. */
export async function syncReadUrlsToServer(urls: string[]): Promise<void> {
  if (!urls.length) return
  let endpoint: string | undefined
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      endpoint = sub?.endpoint
    }
  } catch {
    // ignore
  }
  try {
    await fetch('/api/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls,
        deviceId: getDeviceId(),
        endpoint,
      }),
    })
  } catch {
    // offline — local suppress still applied
  }
}
