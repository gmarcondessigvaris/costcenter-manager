import { Router } from 'express'
import { authMiddleware, requireRole } from '../middleware/auth.ts'
import { query, queryOne } from '../db.ts'
import type { AuthRequest, DbUser } from '../types.ts'

const router = Router()

const SAFE_COLS = 'id, email, display_name, role, is_active'

router.get('/users', authMiddleware, requireRole('admin'), async (_req, res) => {
  const rows = await query<DbUser>(`SELECT ${SAFE_COLS} FROM users WHERE is_active = true ORDER BY display_name`)
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

router.post('/users', authMiddleware, requireRole('admin'), async (req, res) => {
  const { email, display_name, role = 'user' } = req.body as { email: string; display_name: string; role?: string }
  if (!email?.trim() || !display_name?.trim()) {
    res.status(400).json({ detail: 'email and display_name required' }); return
  }
  const existing = await queryOne<DbUser>('SELECT id FROM users WHERE email = $1', [email.trim()])
  if (existing) { res.status(409).json({ detail: 'A user with this email already exists' }); return }

  const rows = await query<DbUser>(
    `INSERT INTO users (azure_id, email, display_name, role)
     VALUES ($1, $2, $3, $4) RETURNING ${SAFE_COLS}`,
    [`dev:${email.trim()}`, email.trim(), display_name.trim(), role]
  )
  res.status(201).json(rows[0])
})

router.put('/users/:id/role', authMiddleware, requireRole('admin'), async (req, res) => {
  const { role } = req.body as { role: string }
  const validRoles = ['admin', 'finance', 'user']
  if (!validRoles.includes(role)) {
    res.status(400).json({ detail: 'Invalid role' })
    return
  }
  const user = await queryOne<DbUser>(
    `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING ${SAFE_COLS}`,
    [role, req.params.id]
  )
  if (!user) { res.status(404).json({ detail: 'User not found' }); return }
  res.json(user)
})

export default router
