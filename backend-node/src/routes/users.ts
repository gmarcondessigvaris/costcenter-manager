import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.ts'
import { query, queryOne } from '../db.ts'
import type { AuthRequest, DbUser } from '../types.ts'

const router = Router()
const SAFE_COLS = 'id, email, display_name, role, is_active'

router.get('/users', authMiddleware, requireRole('super_admin', 'admin'), async (_req, res) => {
  // Include cost_center count per user so the admin page can show assignment status
  const rows = await query<DbUser & { cc_count: string }>(
    `SELECT u.id, u.email, u.display_name, u.role, u.is_active,
            COUNT(ccm.id)::text AS cc_count
     FROM users u
     LEFT JOIN cost_center_members ccm ON ccm.user_id = u.id
     WHERE u.is_active = true
     GROUP BY u.id
     ORDER BY u.display_name`
  )
  res.json(rows)
})

router.get('/users/search', authMiddleware, async (req, res) => {
  const q = String(req.query.q ?? '')
  const rows = await query<DbUser>(
    `SELECT ${SAFE_COLS} FROM users WHERE is_active = true
     AND (display_name ILIKE $1 OR email ILIKE $1)
     ORDER BY display_name LIMIT 20`,
    [`%${q}%`]
  )
  res.json(rows)
})

router.put('/users/:id/role', authMiddleware, requireRole('super_admin', 'admin'), async (req, res) => {
  const actor = (req as AuthRequest).user
  const { role } = req.body as { role: string }
  const validRoles = ['user', 'admin', 'super_admin']
  if (!validRoles.includes(role)) { res.status(400).json({ detail: 'Invalid role' }); return }

  const target = await queryOne<DbUser>(`SELECT ${SAFE_COLS} FROM users WHERE id = $1`, [req.params.id])
  if (!target) { res.status(404).json({ detail: 'User not found' }); return }

  // Admins cannot manage other admin/super_admin accounts
  if (actor.role === 'admin') {
    if (target.role === 'admin' || target.role === 'super_admin') {
      res.status(403).json({ detail: 'Admins cannot manage other admin accounts' }); return
    }
    if (role === 'admin' || role === 'super_admin') {
      res.status(403).json({ detail: 'Admins cannot assign admin roles' }); return
    }
  }

  const user = await queryOne<DbUser>(
    `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING ${SAFE_COLS}`,
    [role, req.params.id]
  )
  res.json(user)
})

router.patch('/users/:id/deactivate', authMiddleware, requireRole('super_admin', 'admin'), async (req, res) => {
  const actor = (req as AuthRequest).user
  const target = await queryOne<DbUser>(`SELECT ${SAFE_COLS} FROM users WHERE id = $1`, [req.params.id])
  if (!target) { res.status(404).json({ detail: 'User not found' }); return }
  if (target.id === actor.id) { res.status(400).json({ detail: 'You cannot deactivate your own account' }); return }

  // Admin cannot deactivate other admin/super_admin
  if (actor.role === 'admin' && (target.role === 'admin' || target.role === 'super_admin')) {
    res.status(403).json({ detail: 'Admins cannot deactivate other admin accounts' }); return
  }

  // Block if assigned to any cost center
  const memberships = await query('SELECT id FROM cost_center_members WHERE user_id = $1', [target.id])
  if (memberships.length > 0) {
    res.status(409).json({
      detail: `${target.display_name} is still assigned to ${memberships.length} cost center(s). Remove them first.`
    }); return
  }

  const user = await queryOne<DbUser>(
    `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING ${SAFE_COLS}`,
    [target.id]
  )
  res.json(user)
})

export default router
