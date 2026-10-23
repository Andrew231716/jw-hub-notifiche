import type { VercelRequest, VercelResponse } from '@vercel/node'
import webpush from 'web-push'
import { categorizeUrl, fetchWhatsNew } from './lib/scrape.js'
import {
  getLastDigestAt,
  getSeenUrls,
  listSubscriptions,
  removeSubscription,
  setLastDigestAt,
  setSeenUrls,
  type StoredSubscription,
} from './lib/dataStore.js'

function parseHm(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + (m || 0)
}

function inQuietHours(sub: StoredSubscription, now = new Date()): boolean {
  if (!sub.quietHoursEnabled) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  const start = parseHm(sub.quietStart)
  const end = parseHm(sub.quietEnd)
  if (start === end) return false
  if (start < end) return mins >= start && mins < end
  return mins >= start || mins < end
}

function shouldSendDigest(
  sub: StoredSubscription,
  lastDigest?: string,
): boolean {
  if (sub.frequency === 'instant') return true
  if (!lastDigest) return false
  const elapsed = Date.now() - new Date(lastDigest).getTime()
  if (sub.frequency === 'hourly') return elapsed >= 60 * 60 * 1000
  if (sub.frequency === 'daily') return elapsed >= 24 * 60 * 60 * 1000
  return true
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization || ''
  const cronSecret = process.env.CRON_SECRET
  const isVercelCron = Boolean(req.headers['x-vercel-cron'])
  if (cronSecret && auth !== `Bearer ${cronSecret}` && !isVercelCron) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:jw-hub@example.com'
  if (!publicKey || !privateKey) {
    return res.status(500).json({ error: 'VAPID keys not configured' })
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)

  const langs = [
    ...new Set((await listSubscriptions()).map((s) => s.language || 'it')),
  ]
  if (!langs.length) langs.push('it')

  let pushed = 0
  let errors = 0
  let seeded = 0
  const lastDigest = await getLastDigestAt()

  for (const lang of langs) {
    const { items } = await fetchWhatsNew(lang)
    if (!items.length) continue

    const allUrls = items.map((i) => i.url)
    const seen = new Set(await getSeenUrls(lang))

    // First run (or empty baseline): remember everything, do NOT notify.
    if (seen.size === 0) {
      await setSeenUrls(lang, allUrls)
      seeded += allUrls.length
      continue
    }

    const fresh = items.filter((item) => !seen.has(item.url))
    await setSeenUrls(lang, [...new Set([...seen, ...allUrls])])

    if (!fresh.length) continue

    const subs = (await listSubscriptions()).filter(
      (s) => (s.language || 'it') === lang,
    )

    for (const sub of subs) {
      if (inQuietHours(sub)) continue
      if (!shouldSendDigest(sub, lastDigest)) continue

      const matched = fresh.filter((u) => {
        const key = categorizeUrl(u.url, u.category)
        return sub.categories?.[key] !== false
      })
      if (!matched.length) continue

      const payload =
        sub.frequency === 'instant' && matched.length === 1
          ? {
              title: 'Nuova novità su jw.org',
              body: matched[0].title,
              url: matched[0].url,
              tag: matched[0].url,
            }
          : {
              title: 'JW Hub Notifiche',
              body:
                matched.length === 1
                  ? matched[0].title
                  : `${matched.length} nuove novità su jw.org`,
              url: '/',
              tag: `digest-${lang}-${matched.map((m) => m.url).join('|').slice(0, 120)}`,
            }

      try {
        await webpush.sendNotification(
          sub.subscription,
          JSON.stringify(payload),
        )
        pushed += 1
      } catch (err) {
        errors += 1
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await removeSubscription(sub.endpoint)
        }
      }
    }
  }

  await setLastDigestAt(new Date().toISOString())
  return res.status(200).json({ ok: true, pushed, errors, seeded, langs })
}
