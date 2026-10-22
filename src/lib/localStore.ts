import type { FetchLog, JwUpdate } from './types'

const READ_KEY = 'jw-hub-read-ids'
const CACHE_KEY = 'jw-hub-updates-cache'
const LOG_KEY = 'jw-hub-last-fetch'

export function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function addReadIds(ids: string[]) {
  const next = getReadIds()
  for (const id of ids) next.add(id)
  localStorage.setItem(READ_KEY, JSON.stringify([...next]))
}

export function applyReadState(updates: JwUpdate[]): JwUpdate[] {
  const readIds = getReadIds()
  return updates.map((item) =>
    readIds.has(item.id) || item.read ? { ...item, read: true } : item,
  )
}

export function cacheUpdates(updates: JwUpdate[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(updates))
}

export function getCachedUpdates(): JwUpdate[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as JwUpdate[]) : []
  } catch {
    return []
  }
}

export function cacheLastFetch(log: FetchLog | null) {
  if (!log) return
  localStorage.setItem(LOG_KEY, JSON.stringify(log))
}

export function getCachedLastFetch(): FetchLog | null {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    return raw ? (JSON.parse(raw) as FetchLog) : null
  } catch {
    return null
  }
}

/** Merge remote items with local cache to preserve first_seen_at and read flags. */
export function mergeWithCache(remote: JwUpdate[]): JwUpdate[] {
  const cached = getCachedUpdates()
  const byUrl = new Map(cached.map((item) => [item.url, item]))
  const readIds = getReadIds()

  const merged = remote.map((item) => {
    const prev = byUrl.get(item.url)
    return {
      ...item,
      id: prev?.id || item.id,
      first_seen_at: prev?.first_seen_at || item.first_seen_at,
      read: Boolean(prev?.read || readIds.has(item.id) || readIds.has(prev?.id || '')),
    }
  })

  // Keep cached items that disappeared temporarily from the page
  for (const prev of cached) {
    if (!merged.some((item) => item.url === prev.url)) {
      merged.push({
        ...prev,
        read: prev.read || readIds.has(prev.id),
      })
    }
  }

  merged.sort((a, b) => {
    const da = a.published_date || ''
    const db = b.published_date || ''
    if (da !== db) return db.localeCompare(da)
    return b.first_seen_at.localeCompare(a.first_seen_at)
  })

  return applyReadState(merged)
}
