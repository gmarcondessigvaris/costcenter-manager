import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.ts'
import { query } from '../db.ts'
import type { AuthRequest } from '../types.ts'

const router = Router()

router.get('/itr-codes', authMiddleware, async (req, res) => {
  const user = (req as AuthRequest).user

  if (user.role === 'super_admin' || user.role === 'admin') {
    return res.json(await query(
      'SELECT id, code, description, is_active FROM itr_codes WHERE is_active = true ORDER BY code'
    ))
  }

  // Cost center owners: only ITR codes used in their cost centers' budget lines
  res.json(await query(
    `SELECT DISTINCT i.id, i.code, i.description, i.is_active
     FROM itr_codes i
     JOIN budget_lines bl ON bl.itr_code_id = i.id
     JOIN cost_center_members ccm ON ccm.cost_center_id = bl.cost_center_id
     WHERE ccm.user_id = $1 AND i.is_active = true
     ORDER BY i.code`,
    [user.id]
  ))
})

export default router
