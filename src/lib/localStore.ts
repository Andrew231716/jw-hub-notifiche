import type { FetchLog, JwUpdate } from './types'
import { loadPreferences } from './preferences'

const READ_KEY = 'jw-hub-read-ids'
const CACHE_KEY = 'jw-hub-updates-cache'
const LOG_KEY = 'jw-hub-last-fetch'
const SEEN_URLS_KEY = 'jw-hub-seen-urls-v2'
const NOTIFIED_URLS_KEY = 'jw-hub-notified-urls-v2'

function currentLang(): string {
  try {
    return loadPreferences().language || 'it'
  } catch {
    return 'it'
  }
}

function langKey(url: string, lang = currentLang()): string {
  return `${lang}::${url}`
}

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

export function clearUpdatesCache() {
  localStorage.removeItem(CACHE_KEY)
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

function readUrlSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function writeUrlSet(key: string, urls: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...urls].slice(-1200)))
}

/** URLs already known for the active language. */
export function getSeenUrls(lang = currentLang()): Set<string> {
  const prefix = `${lang}::`
  const urls = new Set<string>()
  for (const key of readUrlSet(SEEN_URLS_KEY)) {
    if (key.startsWith(prefix)) urls.add(key.slice(prefix.length))
  }
  for (const item of getCachedUpdates()) urls.add(item.url)
  return urls
}

/** Mark URLs as known so they never count as "new" again (per language). */
export function markUrlsSeen(urls: string[], lang = currentLang()) {
  const next = readUrlSet(SEEN_URLS_KEY)
  for (const url of urls) next.add(langKey(url, lang))
  writeUrlSet(SEEN_URLS_KEY, next)
}

export function getNotifiedUrls(lang = currentLang()): Set<string> {
  const prefix = `${lang}::`
  const urls = new Set<string>()
  for (const key of readUrlSet(NOTIFIED_URLS_KEY)) {
    if (key.startsWith(prefix)) urls.add(key.slice(prefix.length))
  }
  return urls
}

export function markUrlsNotified(urls: string[], lang = currentLang()) {
  const next = readUrlSet(NOTIFIED_URLS_KEY)
  for (const url of urls) next.add(langKey(url, lang))
  writeUrlSet(NOTIFIED_URLS_KEY, next)
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
      read: Boolean(
        prev?.read || readIds.has(item.id) || readIds.has(prev?.id || ''),
      ),
    }
  })

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
