/**
 * Lightweight persistence for Vercel serverless.
 * Prefer BLOB_READ_WRITE_TOKEN (@vercel/blob). Fallback: /tmp (ephemeral).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { list, put } from '@vercel/blob'

export type StoredSubscription = {
  endpoint: string
  subscription: {
    endpoint: string
    expirationTime: number | null
    keys: { p256dh: string; auth: string }
  }
  deviceId: string
  language: string
  categories: Record<string, boolean>
  quietHoursEnabled: boolean
  quietStart: string
  quietEnd: string
  frequency: 'instant' | 'hourly' | 'daily'
  updatedAt: string
}

export type SyncRecord = {
  code: string
  deviceId: string
  readIds: string[]
  preferences: Record<string, unknown>
  updates: unknown[]
  updatedAt: string
}

type RootData = {
  subscriptions: StoredSubscription[]
  sync: Record<string, SyncRecord>
  seenUrls: Record<string, string[]>
  lastDigestAt?: string
}

const TMP = join('/tmp', 'jw-hub-data.json')
const BLOB_PATHNAME = 'jw-hub-data.json'

function empty(): RootData {
  return { subscriptions: [], sync: {}, seenUrls: {} }
}

function readTmp(): RootData {
  try {
    if (!existsSync(TMP)) return empty()
    return JSON.parse(readFileSync(TMP, 'utf8')) as RootData
  } catch {
    return empty()
  }
}

function writeTmp(data: RootData) {
  mkdirSync('/tmp', { recursive: true })
  writeFileSync(TMP, JSON.stringify(data))
}

async function readBlob(): Promise<RootData | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return null
  try {
    const result = await list({
      prefix: BLOB_PATHNAME,
      token,
      limit: 5,
    })
    const blob = result.blobs.find((b) => b.pathname === BLOB_PATHNAME)
    if (!blob) return empty()
    const res = await fetch(blob.url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return empty()
    return (await res.json()) as RootData
  } catch {
    return empty()
  }
}

async function writeBlob(data: RootData) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return false
  await put(BLOB_PATHNAME, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
    contentType: 'application/json',
  })
  return true
}

export async function loadData(): Promise<RootData> {
  const fromBlob = await readBlob()
  if (fromBlob) return fromBlob
  return readTmp()
}

export async function saveData(data: RootData): Promise<void> {
  writeTmp(data)
  await writeBlob(data)
}

export async function upsertSubscription(
  row: StoredSubscription,
): Promise<void> {
  const data = await loadData()
  const idx = data.subscriptions.findIndex((s) => s.endpoint === row.endpoint)
  if (idx >= 0) data.subscriptions[idx] = row
  else data.subscriptions.push(row)
  await saveData(data)
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const data = await loadData()
  data.subscriptions = data.subscriptions.filter((s) => s.endpoint !== endpoint)
  await saveData(data)
}

export async function listSubscriptions(): Promise<StoredSubscription[]> {
  const data = await loadData()
  return data.subscriptions
}

export async function saveSync(record: SyncRecord): Promise<void> {
  const data = await loadData()
  const prev = data.sync[record.code]
  data.sync[record.code] = {
    ...record,
    readIds: [...new Set([...(prev?.readIds || []), ...record.readIds])],
    updates: record.updates?.length ? record.updates : prev?.updates || [],
    preferences: { ...(prev?.preferences || {}), ...record.preferences },
  }
  await saveData(data)
}

export async function getSync(code: string): Promise<SyncRecord | null> {
  const data = await loadData()
  return data.sync[code] || null
}

export async function getSeenUrls(lang: string): Promise<string[]> {
  const data = await loadData()
  return data.seenUrls[lang] || []
}

export async function setSeenUrls(lang: string, urls: string[]): Promise<void> {
  const data = await loadData()
  data.seenUrls[lang] = urls.slice(0, 500)
  await saveData(data)
}

export async function getLastDigestAt(): Promise<string | undefined> {
  const data = await loadData()
  return data.lastDigestAt
}

export async function setLastDigestAt(iso: string): Promise<void> {
  const data = await loadData()
  data.lastDigestAt = iso
  await saveData(data)
}
