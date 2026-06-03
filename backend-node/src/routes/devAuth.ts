import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { query } from '../db.ts'

const router = Router()

router.post('/auth/dev-login', async (req, res) => {
  if (process.env.DEV_AUTH !== 'true') {
    res.status(404).json({ detail: 'Not found' })
    return
  }

  const { email, display_name } = req.body as { email: string; display_name: string }
  if (!email?.trim() || !display_name?.trim()) {
    res.status(400).json({ detail: 'email and display_name required' })
    return
  }

  const rows = await query(
    `INSERT INTO users (azure_id, email, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (azure_id) DO UPDATE SET email = $2, display_name = $3, updated_at = NOW()
     RETURNING id, email, display_name, role, is_active`,
    [`dev:${email.trim()}`, email.trim(), display_name.trim()]
  )
  const user = rows[0]

  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.display_name, dev: true },
    process.env.SECRET_KEY ?? 'dev-secret',
    { expiresIn: '8h' }
  )

  res.json({ token, user })
})

export default router
