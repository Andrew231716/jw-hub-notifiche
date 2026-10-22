import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSync, saveSync } from './lib/dataStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    if (req.method === 'GET') {
      const code = String(req.query.code || '').toUpperCase()
      if (!code || code.length < 4) {
        return res.status(400).json({ error: 'Codice non valido' })
      }
      const record = await getSync(code)
      if (!record) return res.status(404).json({ error: 'Codice non trovato' })
      return res.status(200).json(record)
    }

    if (req.method === 'POST') {
      const code = String(req.body?.code || '').toUpperCase()
      if (!code || code.length < 4) {
        return res.status(400).json({ error: 'Codice non valido' })
      }
      await saveSync({
        code,
        deviceId: String(req.body?.deviceId || ''),
        readIds: Array.isArray(req.body?.readIds) ? req.body.readIds : [],
        preferences: req.body?.preferences || {},
        updates: Array.isArray(req.body?.updates) ? req.body.updates : [],
        updatedAt: new Date().toISOString(),
      })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    })
  }
}
