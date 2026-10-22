import type { VercelRequest, VercelResponse } from '@vercel/node'
import { removeSubscription } from '../lib/dataStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const endpoint = String(req.body?.endpoint || '')
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' })
    await removeSubscription(endpoint)
    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    })
  }
}
