import { supabase, supabaseConfigured } from './supabase'
import type { FetchLog, FetchResult, JwUpdate } from './types'

async function localGetUpdates(): Promise<{
  updates: JwUpdate[]
  lastFetch: FetchLog | null
}> {
  const res = await fetch('/api/updates')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function localFetchUpdates(): Promise<FetchResult & { updates?: JwUpdate[]; lastFetch?: FetchLog }> {
  const res = await fetch('/api/fetch', { method: 'POST' })
  if (!res.ok) return { success: false, newCount: 0, error: `HTTP ${res.status}` }
  return res.json()
}

async function localMarkRead(ids: string[]): Promise<void> {
  await fetch('/api/mark-read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
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
