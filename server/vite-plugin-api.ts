import type { Plugin } from 'vite'
import { getLatestLog, getUpdates, markRead, refreshUpdates } from './store.ts'

function sendJson(res: import('http').ServerResponse, status: number, body: unknown) {
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

export function jwHubApiPlugin(): Plugin {
  return {
    name: 'jw-hub-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] || ''
        if (!url.startsWith('/api/')) return next()

        try {
          if (url === '/api/updates' && req.method === 'GET') {
            let updates = getUpdates()
            if (!updates.length) {
              await refreshUpdates()
              updates = getUpdates()
            }
            return sendJson(res, 200, {
              updates,
              lastFetch: getLatestLog(),
            })
          }

          if (url === '/api/fetch' && req.method === 'POST') {
            const result = await refreshUpdates()
            return sendJson(res, 200, {
              success: result.success,
              newCount: result.newCount,
              totalParsed: result.totalParsed,
              error: result.error,
              updates: result.updates,
              lastFetch: result.log,
            })
          }

          if (url === '/api/mark-read' && req.method === 'POST') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { ids?: string[] }
            const ids = Array.isArray(body.ids) ? body.ids : []
            const updates = markRead(ids)
            return sendJson(res, 200, { updates })
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
