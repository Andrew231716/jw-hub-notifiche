import {
  addReadIds,
  applyReadState,
  cacheLastFetch,
  cacheUpdates,
  getCachedLastFetch,
  getCachedUpdates,
  getNotifiedUrls,
  getSeenUrls,
  markUrlsNotified,
  markUrlsSeen,
  mergeWithCache,
} from './localStore'
import { loadPreferences } from './preferences'
import { supabase, supabaseConfigured } from './supabase'
import type { FetchLog, FetchResult, JwUpdate } from './types'

function currentLang(): string {
  try {
    return loadPreferences().language || 'it'
  } catch {
    return 'it'
  }
}

async function localGetUpdates(): Promise<{
  updates: JwUpdate[]
  lastFetch: FetchLog | null
}> {
  try {
    const res = await fetch(`/api/updates?lang=${encodeURIComponent(currentLang())}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as {
      updates: JwUpdate[]
      lastFetch: FetchLog | null
      error?: string
    }
    if (data.error && !data.updates?.length) {
      const cached = applyReadState(getCachedUpdates())
      if (cached.length) {
        return { updates: cached, lastFetch: getCachedLastFetch() }
      }
    }
    const updates = mergeWithCache(data.updates || [])
    cacheUpdates(updates)
    // Baseline: current catalogue is "already seen" so it won't trigger alerts.
    markUrlsSeen(updates.map((u) => u.url))
    if (data.lastFetch) cacheLastFetch(data.lastFetch)
    return { updates, lastFetch: data.lastFetch || getCachedLastFetch() }
  } catch {
    const cached = applyReadState(getCachedUpdates())
    return { updates: cached, lastFetch: getCachedLastFetch() }
  }
}

async function localFetchUpdates(): Promise<
  FetchResult & { updates?: JwUpdate[]; newItems?: JwUpdate[]; lastFetch?: FetchLog }
> {
  const knownUrls = [...getSeenUrls()]
  const isBaseline = knownUrls.length === 0
  try {
    const res = await fetch('/api/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knownUrls, lang: currentLang() }),
    })
    if (!res.ok) {
      return { success: false, newCount: 0, error: `HTTP ${res.status}` }
    }
    const data = await res.json()
    const remote = (data.updates || []) as JwUpdate[]
    const knownSet = new Set(knownUrls)
    const genuinelyNew = isBaseline
      ? []
      : remote.filter((item) => !knownSet.has(item.url))

    const updates = mergeWithCache(remote)
    cacheUpdates(updates)
    markUrlsSeen(updates.map((u) => u.url))
    if (data.lastFetch) cacheLastFetch(data.lastFetch)

    return {
      ...data,
      success: true,
      newCount: genuinelyNew.length,
      updates,
      newItems: genuinelyNew,
    }
  } catch (err) {
    const cached = applyReadState(getCachedUpdates())
    if (cached.length) {
      return {
        success: true,
        newCount: 0,
        error: 'Offline: mostro la cache locale',
        updates: cached,
        newItems: [],
        lastFetch: getCachedLastFetch() || undefined,
      }
    }
    return {
      success: false,
      newCount: 0,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

async function localMarkRead(ids: string[]): Promise<void> {
  addReadIds(ids)
  const cached = applyReadState(
    getCachedUpdates().map((item) =>
      ids.includes(item.id) ? { ...item, read: true } : item,
    ),
  )
  cacheUpdates(cached)
  try {
    await fetch('/api/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
  } catch {
    // localStorage already updated
  }
}

async function supabaseGetUpdates(): Promise<{
  updates: JwUpdate[]
  lastFetch: FetchLog | null
}> {
  const client = supabase!
  const [{ data: updates, error }, { data: lastFetch }] = await Promise.all([
    client
      .from('jw_updates')
      .select('*')
      .order('published_date', { ascending: false, nullsFirst: false })
      .order('first_seen_at', { ascending: false })
      .limit(100),
    client
      .from('jw_fetch_log')
      .select('*')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (error) throw error
  return {
    updates: (updates as JwUpdate[]) || [],
    lastFetch: (lastFetch as FetchLog | null) || null,
  }
}

async function supabaseFetchUpdates(): Promise<FetchResult> {
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  try {
    const res = await fetch(`${url}/functions/v1/fetch-jw-updates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) return { success: false, newCount: 0, error: `HTTP ${res.status}` }
    const data = await res.json()
    return data.success
      ? { success: true, newCount: data.newCount || 0, totalParsed: data.totalParsed }
      : { success: false, newCount: 0, error: data.error || 'Unknown error' }
  } catch (err) {
    return {
      success: false,
      newCount: 0,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

async function supabaseMarkRead(ids: string[]): Promise<void> {
  if (!ids.length) return
  const client = supabase!
  if (ids.length === 1) {
    await client.from('jw_updates').update({ read: true }).eq('id', ids[0])
  } else {
    await client.from('jw_updates').update({ read: true }).in('id', ids)
  }
}

export const usingSupabase = supabaseConfigured

export async function loadUpdates() {
  return usingSupabase ? supabaseGetUpdates() : localGetUpdates()
}

export async function triggerFetch(): Promise<FetchResult> {
  return usingSupabase ? supabaseFetchUpdates() : localFetchUpdates()
}

export async function markItemsRead(ids: string[]): Promise<void> {
  if (!ids.length) return
  return usingSupabase ? supabaseMarkRead(ids) : localMarkRead(ids)
}

/** Notify only for brand-new items not already alerted on this device. */
export function takeNotifiableNewItems(newItems: JwUpdate[]): JwUpdate[] {
  const already = getNotifiedUrls()
  const fresh = newItems.filter((item) => !already.has(item.url))
  if (fresh.length) markUrlsNotified(fresh.map((item) => item.url))
  return fresh
}

export function subscribeToInserts(onInsert: () => void): () => void {
  if (!usingSupabase || !supabase) return () => undefined
  const channel = supabase
    .channel('jw-updates-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'jw_updates' },
      () => onInsert(),
    )
    .subscribe()
  return () => {
    void supabase!.removeChannel(channel)
  }
}
