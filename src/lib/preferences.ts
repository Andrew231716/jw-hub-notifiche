import type { AppPreferences, CategoryKey } from './types'

const PREFS_KEY = 'jw-hub-preferences'
const DEVICE_KEY = 'jw-hub-device-id'

export const DEFAULT_PREFS: AppPreferences = {
  language: 'it',
  categories: {
    news: true,
    articles: true,
    magazines: true,
    music: true,
    video: true,
    other: true,
  },
  quietHoursEnabled: false,
  quietStart: '22:00',
  quietEnd: '07:00',
  frequency: 'instant',
  syncCode: null,
}

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  news: 'Notizie',
  articles: 'Articoli',
  magazines: 'Riviste',
  music: 'Musica',
  video: 'Video',
  other: 'Altro',
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export function loadPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS, categories: { ...DEFAULT_PREFS.categories } }
    const parsed = JSON.parse(raw) as Partial<AppPreferences>
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      categories: { ...DEFAULT_PREFS.categories, ...parsed.categories },
    }
  } catch {
    return { ...DEFAULT_PREFS, categories: { ...DEFAULT_PREFS.categories } }
  }
}

export function savePreferences(prefs: AppPreferences) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

function parseHm(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

/** True when notifications should be suppressed (quiet hours). */
export function isInQuietHours(prefs: AppPreferences, now = new Date()): boolean {
  if (!prefs.quietHoursEnabled) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  const start = parseHm(prefs.quietStart)
  const end = parseHm(prefs.quietEnd)
  if (start === end) return false
  if (start < end) return mins >= start && mins < end
  return mins >= start || mins < end
}

export function categorizeUrl(
  url: string,
  category: string | null,
): CategoryKey {
  const cat = category?.toUpperCase() || ''
  if (
    cat.includes('VIDEO') ||
    cat.includes('VIDÉO') ||
    cat.includes('VÍDEO') ||
    url.includes('/biblioteca-digitale/video/') ||
    url.includes('/library/videos/') ||
    (url.includes('lank=') && url.includes('VIDEO'))
  )
    return 'video'
  if (cat.includes('NEWS') || url.includes('/news/')) return 'news'
  if (url.includes('/musica/') || cat.includes('CANZON')) return 'music'
  if (url.includes('/riviste/') || cat.includes('TORRE') || cat.includes('VIGILATE') || cat.includes('SVEGLIA'))
    return 'magazines'
  if (
    url.includes('/articoli/') ||
    url.includes('/altri-argomenti/') ||
    cat.includes('ARTICOL')
  )
    return 'articles'
  return 'other'
}

export function isCategoryEnabled(
  prefs: AppPreferences,
  url: string,
  category: string | null,
): boolean {
  return Boolean(prefs.categories[categorizeUrl(url, category)])
}

export function generateSyncCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  for (const b of bytes) code += alphabet[b % alphabet.length]
  return code
}
