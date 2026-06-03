import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.ts'
import { query, queryOne } from '../db.ts'
import { logAction } from '../services/audit.ts'
import type { AuthRequest } from '../types.ts'

const router = Router()

// Build full cost center response including members
async function getCostCenter(id: string) {
  const cc = await queryOne(
    'SELECT id, code, name, is_active, created_at FROM cost_centers WHERE id = $1',
    [id]
  )
  if (!cc) return null
  const members = await query(
    `SELECT ccm.id, ccm.role,
            u.id AS user_id, u.email, u.display_name, u.role AS user_role, u.is_active
     FROM cost_center_members ccm
     JOIN users u ON u.id = ccm.user_id
     WHERE ccm.cost_center_id = $1`,
    [id]
  )
  return {
    ...cc,
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      user: { id: m.user_id, email: m.email, display_name: m.display_name, role: m.user_role, is_active: m.is_active },
    })),
  }
}

router.get('/cost-centers', authMiddleware, async (req, res) => {
  const user = (req as AuthRequest).user
  let rows: Array<Record<string, unknown>>

  if (user.role === 'admin' || user.role === 'finance') {
    rows = await query('SELECT id FROM cost_centers WHERE is_active = true ORDER BY code')
  } else {
    rows = await query(
      `SELECT cc.id FROM cost_centers cc
       JOIN cost_center_members ccm ON ccm.cost_center_id = cc.id
       WHERE ccm.user_id = $1 AND cc.is_active = true ORDER BY cc.code`,
      [user.id]
    )
  }

  const costCenters = await Promise.all(rows.map((r) => getCostCenter(r.id as string)))
  res.json(costCenters.filter(Boolean))
})

router.post('/cost-centers', authMiddleware, requireRole('admin'), async (req, res) => {
  const { code, name } = req.body as { code: string; name: string }
  if (!code || !name) { res.status(400).json({ detail: 'code and name required' }); return }

  const existing = await queryOne('SELECT id FROM cost_centers WHERE code = $1', [code])
  if (existing) { res.status(409).json({ detail: 'Cost center code already exists' }); return }

  const rows = await query(
    'INSERT INTO cost_centers (code, name) VALUES ($1, $2) RETURNING id',
    [code, name]
  )
  const user = (req as AuthRequest).user
  await logAction({ entityType: 'CostCenter', entityId: rows[0].id as string, action: 'created', userId: user.id, details: { code, name } })
  res.status(201).json(await getCostCenter(rows[0].id as string))
})

router.put('/cost-centers/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name, is_active } = req.body as { name?: string; is_active?: boolean }
  const sets: string[] = ['updated_at = NOW()']
  const vals: unknown[] = []
  if (name !== undefined) { vals.push(name); sets.push(`name = $${vals.length}`) }
  if (is_active !== undefined) { vals.push(is_active); sets.push(`is_active = $${vals.length}`) }
  vals.push(req.params.id)
  await query(`UPDATE cost_centers SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals)
  const cc = await getCostCenter(req.params.id)
  if (!cc) { res.status(404).json({ detail: 'Not found' }); return }
  res.json(cc)
})

router.post('/cost-centers/:id/members', authMiddleware, requireRole('admin'), async (req, res) => {
  const { user_id, role = 'owner' } = req.body as { user_id: string; role?: string }
  const ccId = req.params.id
  const actor = (req as AuthRequest).user

  const ccExists = await queryOne('SELECT id FROM cost_centers WHERE id = $1', [ccId])
  if (!ccExists) { res.status(404).json({ detail: 'Cost center not found' }); return }
  const userExists = await queryOne('SELECT id FROM users WHERE id = $1', [user_id])
  if (!userExists) { res.status(404).json({ detail: 'User not found' }); return }

  await query(
    `INSERT INTO cost_center_members (cost_center_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (cost_center_id, user_id) DO UPDATE SET role = $3, updated_at = NOW()`,
    [ccId, user_id, role]
  )
  await logAction({ entityType: 'CostCenter', entityId: ccId, action: 'member_added', userId: actor.id, details: { user_id, role } })
  res.status(201).json(await getCostCenter(ccId))
})

router.delete('/cost-centers/:id/members/:userId', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id: ccId, userId } = req.params
  const actor = (req as AuthRequest).user
  const result = await query(
    'DELETE FROM cost_center_members WHERE cost_center_id = $1 AND user_id = $2 RETURNING id',
    [ccId, userId]
  )
  if (!result.length) { res.status(404).json({ detail: 'Member not found' }); return }
  await logAction({ entityType: 'CostCenter', entityId: ccId, action: 'member_removed', userId: actor.id, details: { removed_user_id: userId } })
  res.status(204).send()
})

export default router
