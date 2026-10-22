import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchWhatsNew, makeFetchLog, toUpdates } from './lib/scrape'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const knownUrls = new Set<string>(
      Array.isArray(req.body?.knownUrls) ? req.body.knownUrls : [],
    )
    const { items, error } = await fetchWhatsNew()
    if (error && !items.length) {
      return res.status(200).json({
        success: false,
        newCount: 0,
        totalParsed: 0,
        error,
        updates: [],
        lastFetch: makeFetchLog(0, 'error', error),
      })
    }

    const { updates, newCount } = toUpdates(items, knownUrls)
    return res.status(200).json({
      success: true,
      newCount: knownUrls.size ? newCount : 0,
      totalParsed: items.length,
      updates,
      lastFetch: makeFetchLog(
        knownUrls.size ? newCount : updates.length,
        'success',
        null,
      ),
    })
  } catch (err) {
    return res.status(500).json({
      success: false,
      newCount: 0,
      error: err instanceof Error ? err.message : 'Server error',
    })
  }
}
