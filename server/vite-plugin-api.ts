import type { Plugin } from 'vite'
import {
  getSync,
  listSubscriptions,
  removeSubscription,
  saveSync,
  upsertSubscription,
} from '../api/lib/dataStore.ts'
import { fetchWhatsNew, makeFetchLog, toUpdates } from '../api/lib/scrape.ts'
import { getLatestLog, getUpdates, markRead, refreshUpdates } from './store.ts'

function sendJson(
  res: import('http').ServerResponse,
  status: number,
  body: unknown,
) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readBody(req: import('http').IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function queryLang(url: string): string {
  try {
    return new URL(url, 'http://local').searchParams.get('lang') || 'it'
  } catch {
    return 'it'
  }
}

export function jwHubApiPlugin(): Plugin {
  return {
    name: 'jw-hub-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const full = req.url || ''
        const url = full.split('?')[0] || ''
        if (!url.startsWith('/api/')) return next()

        try {
          if (url === '/api/updates' && req.method === 'GET') {
            const lang = queryLang(full)
            const { items, error } = await fetchWhatsNew(lang)
            if (error && !items.length) {
              const cached = getUpdates()
              return sendJson(res, 200, {
                updates: cached,
                lastFetch: getLatestLog(),
                error,
              })
            }
            const { updates } = toUpdates(items)
            return sendJson(res, 200, {
              updates,
              lastFetch: makeFetchLog(updates.length, 'success', null),
            })
          }

          if (url === '/api/fetch' && req.method === 'POST') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              knownUrls?: string[]
              lang?: string
            }
            const lang = body.lang || 'it'
            const known = new Set(body.knownUrls || [])
            const { items, error } = await fetchWhatsNew(lang)
            if (error && !items.length) {
              return sendJson(res, 200, {
                success: false,
                newCount: 0,
                error,
                updates: getUpdates(),
                lastFetch: makeFetchLog(0, 'error', error),
              })
            }
            const { updates, newCount } = toUpdates(items, known)
            // keep file store in sync for local mark-read
            await refreshUpdates(lang)
            return sendJson(res, 200, {
              success: true,
              newCount: known.size ? newCount : 0,
              totalParsed: items.length,
              updates,
              lastFetch: makeFetchLog(
                known.size ? newCount : updates.length,
                'success',
                null,
              ),
            })
          }

          if (url === '/api/mark-read' && req.method === 'POST') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { ids?: string[] }
            const ids = Array.isArray(body.ids) ? body.ids : []
            const updates = markRead(ids)
            return sendJson(res, 200, { updates })
          }

          if (url === '/api/push/subscribe' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}')
            const subscription = body.subscription
            if (!subscription?.endpoint) {
              return sendJson(res, 400, { error: 'Invalid subscription' })
            }
            await upsertSubscription({
              endpoint: subscription.endpoint,
              subscription,
              deviceId: String(body.deviceId || 'unknown'),
              language: String(body.language || 'it'),
              categories: body.categories || {
                news: true,
                articles: true,
                magazines: true,
                music: true,
                other: true,
              },
              quietHoursEnabled: Boolean(body.quietHoursEnabled),
              quietStart: String(body.quietStart || '22:00'),
              quietEnd: String(body.quietEnd || '07:00'),
              frequency:
                body.frequency === 'hourly' || body.frequency === 'daily'
                  ? body.frequency
                  : 'instant',
              updatedAt: new Date().toISOString(),
            })
            return sendJson(res, 200, { ok: true })
          }

          if (url === '/api/push/unsubscribe' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}')
            await removeSubscription(String(body.endpoint || ''))
            return sendJson(res, 200, { ok: true })
          }

          if (url === '/api/sync' && req.method === 'GET') {
            const code = (
              new URL(full, 'http://local').searchParams.get('code') || ''
            ).toUpperCase()
            const record = await getSync(code)
            if (!record) return sendJson(res, 404, { error: 'Codice non trovato' })
            return sendJson(res, 200, record)
          }

          if (url === '/api/sync' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}')
            const code = String(body.code || '').toUpperCase()
            await saveSync({
              code,
              deviceId: String(body.deviceId || ''),
              readIds: Array.isArray(body.readIds) ? body.readIds : [],
              preferences: body.preferences || {},
              updates: Array.isArray(body.updates) ? body.updates : [],
              updatedAt: new Date().toISOString(),
            })
            return sendJson(res, 200, { ok: true })
          }

          if (url === '/api/vapid-public' && req.method === 'GET') {
            return sendJson(res, 200, {
              publicKey:
                process.env.VAPID_PUBLIC_KEY ||
                process.env.VITE_VAPID_PUBLIC_KEY ||
                null,
            })
          }

          if (url === '/api/cron' && req.method === 'GET') {
            return sendJson(res, 200, {
              ok: true,
              subscriptions: (await listSubscriptions()).length,
              note: 'Cron runs on Vercel; local stub only.',
            })
          }

          return sendJson(res, 404, { error: 'Not found' })
        } catch (err) {
          return sendJson(res, 500, {
            error: err instanceof Error ? err.message : 'Server error',
          })
        }
      })
    },
  }
}
