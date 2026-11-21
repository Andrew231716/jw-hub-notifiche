import type { VercelRequest, VercelResponse } from '@vercel/node'
import { appendReadUrls } from './lib/dataStore.js'

/**
 * Persist read URLs on the server so Web Push cron skips them.
 * Client still keeps its own localStorage copy.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = req.body || {}
    const urls = Array.isArray(body.urls)
      ? body.urls.filter((u: unknown) => typeof u === 'string' && u)
      : []
    const deviceId =
      typeof body.deviceId === 'string' ? body.deviceId : undefined
    const endpoint =
      typeof body.endpoint === 'string' ? body.endpoint : undefined

    let synced = 0
    if (urls.length && (deviceId || endpoint)) {
      synced = await appendReadUrls({ deviceId, endpoint, urls })
    }

    return res.status(200).json({ ok: true, synced })
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    })
  }
}
