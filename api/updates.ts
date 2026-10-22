import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchWhatsNew, makeFetchLog, toUpdates } from './lib/scrape.js'

export default async function handler(
  _req: VercelRequest,
  res: VercelResponse,
) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    const { items, error } = await fetchWhatsNew()
    if (error && !items.length) {
      return res.status(200).json({
        updates: [],
        lastFetch: makeFetchLog(0, 'error', error),
        error,
      })
    }
    const { updates } = toUpdates(items)
    return res.status(200).json({
      updates,
      lastFetch: makeFetchLog(updates.length, 'success', null),
    })
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    })
  }
}
