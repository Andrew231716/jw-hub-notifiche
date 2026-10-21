const MONTHS_IT = [
  'gen',
  'feb',
  'mar',
  'apr',
  'mag',
  'giu',
  'lug',
  'ago',
  'set',
  'ott',
  'nov',
  'dic',
]

export function formatPublishedDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  const day = date.getDate()
  const month = MONTHS_IT[date.getMonth()]
  const year = date.getFullYear()
  const now = new Date()
  if (year === now.getFullYear()) return `${day} ${month}`
  return `${day} ${month} ${year}`
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'adesso'
  if (minutes < 60) return `${minutes} min fa`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h fa`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} gg fa`
  return formatPublishedDate(value.slice(0, 10))
}
