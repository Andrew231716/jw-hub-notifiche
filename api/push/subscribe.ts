import type { VercelRequest, VercelResponse } from '@vercel/node'
import { upsertSubscription } from '../lib/dataStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = req.body || {}
    const subscription = body.subscription
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription' })
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
        video: true,
        other: true,
      },
      quietHoursEnabled: Boolean(body.quietHoursEnabled),
      quietStart: String(body.quietStart || '22:00'),
      quietEnd: String(body.quietEnd || '07:00'),
      frequency: body.frequency === 'hourly' || body.frequency === 'daily' ? body.frequency : 'instant',
      updatedAt: new Date().toISOString(),
    })
    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    })
  }
}
