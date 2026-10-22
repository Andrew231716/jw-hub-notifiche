import {
  addReadIds,
  cacheUpdates,
  getCachedUpdates,
  getReadIds,
} from './localStore'
import { getDeviceId, loadPreferences, savePreferences } from './preferences'
import type { AppPreferences, JwUpdate } from './types'

export async function pushSyncState(
  prefs: AppPreferences,
): Promise<{ ok: boolean; error?: string }> {
  const code = prefs.syncCode
  if (!code) return { ok: false, error: 'Nessun codice sync' }
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      deviceId: getDeviceId(),
      readIds: [...getReadIds()],
      preferences: prefs,
      updates: getCachedUpdates().slice(0, 100),
    }),
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  return { ok: true }
}

export async function pullSyncState(code: string): Promise<{
  ok: boolean
  error?: string
  preferences?: AppPreferences
}> {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return {
      ok: false,
      error: (body as { error?: string }).error || `HTTP ${res.status}`,
    }
  }
  const data = (await res.json()) as {
    readIds?: string[]
    preferences?: AppPreferences
    updates?: JwUpdate[]
  }
  if (data.readIds?.length) addReadIds(data.readIds)
  if (data.updates?.length) {
    cacheUpdates(
      data.updates.map((u) => ({
        ...u,
        read: Boolean(data.readIds?.includes(u.id) || u.read),
      })),
    )
  }
  const prefs = {
    ...loadPreferences(),
    ...(data.preferences || {}),
    syncCode: code,
  }
  savePreferences(prefs)
  return { ok: true, preferences: prefs }
}
