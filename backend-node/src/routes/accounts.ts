import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.ts'
import { query } from '../db.ts'
import type { AuthRequest } from '../types.ts'

const router = Router()

router.get('/accounts', authMiddleware, async (req, res) => {
  const user = (req as AuthRequest).user

  if (user.role === 'super_admin' || user.role === 'admin') {
    return res.json(await query(
      'SELECT id, code, description, is_active FROM accounts WHERE is_active = true ORDER BY code'
    ))
  }

  // Cost center owners: only accounts used in their cost centers' budget lines
  res.json(await query(
    `SELECT DISTINCT a.id, a.code, a.description, a.is_active
     FROM accounts a
     JOIN budget_lines bl ON bl.account_id = a.id
     JOIN cost_center_members ccm ON ccm.cost_center_id = bl.cost_center_id
     WHERE ccm.user_id = $1 AND a.is_active = true
     ORDER BY a.code`,
    [user.id]
  ))
})

export default router
