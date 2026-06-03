import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.ts'
import { query, queryOne } from '../db.ts'
import type { AuthRequest } from '../types.ts'

const router = Router()

// All authenticated users can read currencies (needed for invoice form)
router.get('/currencies', authMiddleware, async (_req, res) => {
  res.json(await query(
    `SELECT c.id, c.code, c.name, c.rate_to_chf, c.is_active, c.updated_at,
            u.display_name AS updated_by
     FROM currencies c
     LEFT JOIN users u ON u.id = c.updated_by_id
     ORDER BY c.code`
  ))
})

router.post('/currencies', authMiddleware, requireRole('super_admin', 'admin'), async (req, res) => {
  const actor = (req as AuthRequest).user
  const { code, name, rate_to_chf } = req.body as { code: string; name: string; rate_to_chf: number }
  if (!code?.trim() || !name?.trim() || !rate_to_chf) {
    res.status(400).json({ detail: 'code, name and rate_to_chf required' }); return
  }
  const rows = await query(
    `INSERT INTO currencies (code, name, rate_to_chf, updated_by_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (code) DO UPDATE SET name=$2, rate_to_chf=$3, updated_by_id=$4, updated_at=NOW()
     RETURNING *`,
    [code.toUpperCase().trim(), name.trim(), rate_to_chf, actor.id]
  )
  res.status(201).json(rows[0])
})

router.put('/currencies/:id', authMiddleware, requireRole('super_admin', 'admin'), async (req, res) => {
  const actor = (req as AuthRequest).user
  const { name, rate_to_chf, is_active } = req.body as { name?: string; rate_to_chf?: number; is_active?: boolean }
  const sets: string[] = ['updated_at = NOW()', `updated_by_id = '${actor.id}'`]
  const vals: unknown[] = []
  if (name        !== undefined) { vals.push(name);        sets.push(`name = $${vals.length}`) }
  if (rate_to_chf !== undefined) { vals.push(rate_to_chf); sets.push(`rate_to_chf = $${vals.length}`) }
  if (is_active   !== undefined) { vals.push(is_active);   sets.push(`is_active = $${vals.length}`) }
  vals.push(req.params.id)
  const rows = await query(
    `UPDATE currencies SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
    vals
  )
  if (!rows.length) { res.status(404).json({ detail: 'Currency not found' }); return }
  res.json(rows[0])
})

export default router
