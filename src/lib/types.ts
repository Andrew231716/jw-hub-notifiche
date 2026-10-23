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

export type FilterValue =
  | 'unread'
  | 'all'
  | 'news'
  | 'articles'
  | 'magazines'
  | 'music'
  | 'video'

export type SortValue = 'newest' | 'oldest' | 'title'

export type ToastMessage = {
  type: 'success' | 'error' | 'info'
  text: string
}

export type FetchResult = {
  success: boolean
  newCount: number
  totalParsed?: number
  error?: string
  updates?: JwUpdate[]
  newItems?: JwUpdate[]
  lastFetch?: FetchLog
}

export type NotifyFrequency = 'instant' | 'hourly' | 'daily'

export type CategoryKey =
  | 'news'
  | 'articles'
  | 'magazines'
  | 'music'
  | 'video'
  | 'other'

export type AppPreferences = {
  language: string
  categories: Record<CategoryKey, boolean>
  quietHoursEnabled: boolean
  quietStart: string
  quietEnd: string
  frequency: NotifyFrequency
  syncCode: string | null
}

export type PushSubscriptionJSON = {
  endpoint: string
  expirationTime: number | null
  keys: { p256dh: string; auth: string }
}
