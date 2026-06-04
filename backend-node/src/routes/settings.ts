import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.ts'
import { query, queryOne } from '../db.ts'

const router = Router()

router.get('/settings', authMiddleware, requireRole('super_admin', 'admin'), async (_req, res) => {
  const rows = await query('SELECT key, value FROM system_settings')
  const settings: Record<string, string> = {}
  for (const r of rows) settings[r.key as string] = r.value as string
  res.json(settings)
})

router.put('/settings/:key', authMiddleware, requireRole('super_admin', 'admin'), async (req, res) => {
  const { value } = req.body as { value: string }
  await query(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [req.params.key, value]
  )
  res.json({ key: req.params.key, value })
})

export { router as settingsRouter }

// Helper used by reports to get exchange rate mode
export async function getExchangeRateMode(): Promise<'auto' | 'manual'> {
  const row = await queryOne('SELECT value FROM system_settings WHERE key = $1', ['exchange_rate_mode'])
  return (row?.value === 'auto') ? 'auto' : 'manual'
}

// Fetch live rates from Frankfurter (ECB rates, free, no key required)
// Returns { EUR: 1.05, USD: 0.92, ... } — CHF per 1 unit of each currency
export async function fetchLiveRates(): Promise<Record<string, number>> {
  try {
    const resp = await fetch('https://api.frankfurter.app/latest?base=CHF')
    const data = await resp.json() as { date: string; rates: Record<string, number> }
    const result: Record<string, number> = { CHF: 1.0 }
    for (const [code, rateFromChf] of Object.entries(data.rates)) {
      // rateFromChf = units of `code` per 1 CHF  →  rate_to_chf = 1 / rateFromChf
      result[code] = Math.round((1 / rateFromChf) * 1_000_000) / 1_000_000
    }
    return result
  } catch {
    return {}
  }
}

export default router
