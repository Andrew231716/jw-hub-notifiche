import { createHash, randomUUID } from 'node:crypto'

export type ParsedItem = {
  url: string
  title: string
  category: string | null
  published_date: string | null
  image_url: string | null
  description: string | null
}

export type JwUpdate = {
  id: string
  url: string
  title: string
  category: string | null
  published_date: string | null
  image_url: string | null
  description: string | null
  first_seen_at: string
  notified: boolean
  read: boolean
}

export type FetchLog = {
  id: string
  fetched_at: string
  new_count: number
  status: string
  error_message: string | null
}

const LOCALE_PATHS: Record<string, string> = {
  it: '/it/cosa-nuovo/',
  en: '/en/whats-new/',
  fr: '/fr/nouveautes/',
  de: '/de/neu-auf-unserer-website/',
  es: '/es/novedades/',
  pt: '/pt/Novidades/',
}

export function whatsNewUrl(lang = 'it'): string {
  return `https://www.jw.org${LOCALE_PATHS[lang] || LOCALE_PATHS.it}`
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

export function parseWhatsNewHtml(html: string, lang = 'it'): ParsedItem[] {
  const items: ParsedItem[] = []
  const blockRe =
    /<div class="synopsis\s+([^"]*)"[\s\S]*?<\/div>\s*<\/div>/g
  let match: RegExpExecArray | null
  const skipPath = LOCALE_PATHS[lang] || LOCALE_PATHS.it

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
    if (!title || href.includes(skipPath.replace(/\/$/, ''))) continue

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

export async function fetchWhatsNew(lang = 'it'): Promise<{
  items: ParsedItem[]
  error?: string
}> {
  try {
    const res = await fetch(whatsNewUrl(lang), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; JWHubNotifiche/1.0; +https://vercel.app)',
        Accept: 'text/html',
      },
    })
    if (!res.ok) return { items: [], error: `HTTP ${res.status}` }
    const html = await res.text()
    const items = parseWhatsNewHtml(html, lang)
    if (!items.length) return { items: [], error: 'No items parsed from page' }
    return { items }
  } catch (err) {
    return {
      items: [],
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

export function toUpdates(
  parsed: ParsedItem[],
  knownUrls: Set<string> = new Set(),
): { updates: JwUpdate[]; newCount: number } {
  const now = new Date().toISOString()
  let newCount = 0
  const updates = parsed.map((item) => {
    const isNew = !knownUrls.has(item.url)
    if (isNew) newCount += 1
    return {
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
    }
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

export function categorizeUrl(
  url: string,
  category: string | null,
): 'news' | 'articles' | 'magazines' | 'music' | 'other' {
  const cat = category?.toUpperCase() || ''
  if (cat.includes('NEWS') || url.includes('/news/')) return 'news'
  if (url.includes('/musica/') || url.includes('/music/') || cat.includes('CANZON') || cat.includes('SONG'))
    return 'music'
  if (
    url.includes('/riviste/') ||
    url.includes('/magazines/') ||
    cat.includes('TORRE') ||
    cat.includes('WATCHTOWER') ||
    cat.includes('VIGILATE') ||
    cat.includes('AWAKE')
  )
    return 'magazines'
  if (
    url.includes('/articoli/') ||
    url.includes('/bible-teachings/') ||
    url.includes('/altri-argomenti/')
  )
    return 'articles'
  return 'other'
}
