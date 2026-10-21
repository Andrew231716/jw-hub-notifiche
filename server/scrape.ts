import { createHash, randomUUID } from 'node:crypto'
import type { FetchLog, JwUpdate } from '../src/lib/types.ts'

const JW_URL = 'https://www.jw.org/it/cosa-nuovo/'

export type ParsedItem = {
  url: string
  title: string
  category: string | null
  published_date: string | null
  image_url: string | null
  description: string | null
}

function absoluteUrl(href: string): string {
  if (href.startsWith('http')) return href
  return `https://www.jw.org${href.startsWith('/') ? '' : '/'}${href}`
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

export function parseWhatsNewHtml(html: string): ParsedItem[] {
  const items: ParsedItem[] = []
  const blockRe =
    /<div class="synopsis\s+([^"]*)"[\s\S]*?<\/div>\s*<\/div>/g
  let match: RegExpExecArray | null

  while ((match = blockRe.exec(html))) {
    const classes = match[1]
    const block = match[0]
    if (classes.includes('WhatsNewPage')) continue

    const titleMatch = block.match(
      /<h3>\s*<a href="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/,
    )
    if (!titleMatch) continue

    const href = titleMatch[1]
    const title = decodeEntities(titleMatch[2].replace(/\s+/g, ' ').trim())
    if (!title || href.includes('/cosa-nuovo/')) continue

    const contextTitle = block.match(
      /<p class="contextTitle">\s*([\s\S]*?)\s*<\/p>/,
    )
    const category = contextTitle
      ? decodeEntities(contextTitle[1].replace(/\s+/g, ' ').trim())
      : classes.includes('news')
        ? 'NEWS'
        : null

    const dateMatch = block.match(/<p class="meta pubDate">\s*([^<]+)\s*<\/p>/)
    const published_date = dateMatch ? dateMatch[1].trim() : null

    const imgMatch =
      block.match(/data-img-size-xs='([^']+)'/) ||
      block.match(/data-img-size-xs="([^"]+)"/) ||
      block.match(/<img[^>]+src=['"]([^'"]+)['"]/)

    const descMatch = block.match(/<p class="desc">\s*([\s\S]*?)\s*<\/p>/)
    const description = descMatch
      ? decodeEntities(descMatch[1].replace(/\s+/g, ' ').trim()) || null
      : null

    items.push({
      url: absoluteUrl(href),
      title,
      category,
      published_date,
      image_url: imgMatch ? imgMatch[1] : null,
      description,
    })
  }

  return items
}

function stableId(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 32)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
}

export async function fetchWhatsNew(): Promise<{
  items: ParsedItem[]
  error?: string
}> {
  try {
    const res = await fetch(JW_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; JWHubNotifiche/1.0; +https://localhost)',
        Accept: 'text/html',
      },
    })
    if (!res.ok) return { items: [], error: `HTTP ${res.status}` }
    const html = await res.text()
    const items = parseWhatsNewHtml(html)
    if (!items.length) return { items: [], error: 'No items parsed from page' }
    return { items }
  } catch (err) {
    return {
      items: [],
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

export function mergeUpdates(
  existing: JwUpdate[],
  parsed: ParsedItem[],
): { updates: JwUpdate[]; newCount: number } {
  const byUrl = new Map(existing.map((item) => [item.url, item]))
  const now = new Date().toISOString()
  let newCount = 0

  for (const item of parsed) {
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
      byUrl.set(item.url, {
        id: stableId(item.url),
        url: item.url,
        title: item.title,
        category: item.category,
        published_date: item.published_date,
        image_url: item.image_url,
        description: item.description,
        first_seen_at: now,
        notified: false,
        read: false,
      })
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

export function makeFetchLog(
  newCount: number,
  status: string,
  errorMessage: string | null,
): FetchLog {
  return {
    id: randomUUID(),
    fetched_at: new Date().toISOString(),
    new_count: newCount,
    status,
    error_message: errorMessage,
  }
}
