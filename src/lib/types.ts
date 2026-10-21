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

export type ToastMessage = {
  type: 'success' | 'error' | 'info'
  text: string
}

export type FetchResult = {
  success: boolean
  newCount: number
  totalParsed?: number
  error?: string
}
