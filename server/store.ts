import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fetchWhatsNew,
  makeFetchLog,
  toUpdates,
  type JwUpdate as ApiUpdate,
  type ParsedItem,
} from '../api/lib/scrape.ts'
import type { FetchLog, JwUpdate } from '../src/lib/types.ts'

const root = dirname(fileURLToPath(import.meta.url))
const dataDir = join(root, '.data')
const updatesPath = join(dataDir, 'updates.json')
const logPath = join(dataDir, 'fetch-log.json')

function ensureDir() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(path: string, value: unknown) {
  ensureDir()
  writeFileSync(path, JSON.stringify(value, null, 2))
}

export function getUpdates(): JwUpdate[] {
  return readJson<JwUpdate[]>(updatesPath, [])
}

export function getLatestLog(): FetchLog | null {
  const logs = readJson<FetchLog[]>(logPath, [])
  return logs[0] ?? null
}

export function markRead(ids: string[]): JwUpdate[] {
  const updates = getUpdates().map((item) =>
    ids.includes(item.id) ? { ...item, read: true } : item,
  )
  writeJson(updatesPath, updates)
  return updates
}

function mergeUpdates(
  existing: JwUpdate[],
  parsed: ParsedItem[],
): { updates: JwUpdate[]; newCount: number } {
  const byUrl = new Map(existing.map((item) => [item.url, item]))
  const { updates: fresh } = toUpdates(
    parsed,
    new Set(existing.map((e) => e.url)),
  )
  let newCount = 0
  for (const item of fresh as ApiUpdate[]) {
    const prev = byUrl.get(item.url)
    if (prev) {
      byUrl.set(item.url, {
        ...prev,
        title: item.title,
        category: item.category,
        published_date: item.published_date,
        image_url: item.image_url,
        description: item.description,
      })
    } else {
      newCount += 1
      byUrl.set(item.url, item as JwUpdate)
    }
  }
  const updates = [...byUrl.values()].sort((a, b) => {
    const da = a.published_date || ''
    const db = b.published_date || ''
    if (da !== db) return db.localeCompare(da)
    return b.first_seen_at.localeCompare(a.first_seen_at)
  })
  return { updates, newCount }
}

export async function refreshUpdates(lang = 'it'): Promise<{
  success: boolean
  newCount: number
  totalParsed: number
  error?: string
  updates: JwUpdate[]
  log: FetchLog
}> {
  const existing = getUpdates()
  const { items, error } = await fetchWhatsNew(lang)

  if (error && !items.length) {
    const log = makeFetchLog(0, 'error', error)
    const logs = [log, ...readJson<FetchLog[]>(logPath, [])].slice(0, 50)
    writeJson(logPath, logs)
    return {
      success: false,
      newCount: 0,
      totalParsed: 0,
      error,
      updates: existing,
      log,
    }
  }

  const { updates, newCount } = mergeUpdates(existing, items)
  writeJson(updatesPath, updates)
  const log = makeFetchLog(
    newCount,
    'success',
    items.length ? null : error || null,
  )
  const logs = [log, ...readJson<FetchLog[]>(logPath, [])].slice(0, 50)
  writeJson(logPath, logs)

  return {
    success: true,
    newCount,
    totalParsed: items.length,
    updates,
    log,
  }
}
