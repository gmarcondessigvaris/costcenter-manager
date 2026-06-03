import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.ts'
import type { AuthRequest } from '../types.ts'

const router = Router()

router.get('/auth/me', authMiddleware, (req, res) => {
  const { id, email, display_name, role, is_active } = (req as AuthRequest).user
  res.json({ id, email, display_name, role, is_active })
})

export default router
