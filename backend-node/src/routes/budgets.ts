import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { authMiddleware, requireRole } from '../middleware/auth.ts'
import { query, queryOne } from '../db.ts'
import { logAction } from '../services/audit.ts'
import { parseBudgetExcel } from '../services/budgetParser.ts'
import type { AuthRequest } from '../types.ts'

const router = Router()

const uploadDir = process.env.UPLOAD_DIR ?? 'uploads'
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(path.join(uploadDir, 'budgets'), { recursive: true })
    cb(null, path.join(uploadDir, 'budgets'))
  },
  filename: (_req, file, cb) => cb(null, `${uuidv4()}_${file.originalname}`),
})
const upload = multer({ storage, fileFilter: (_req, file, cb) => {
  cb(null, /\.(xlsx|xls)$/i.test(file.originalname))
}})

// â”€â”€ Vendors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/vendors', authMiddleware, async (req, res) => {
  const includeArchived = req.query.include_archived === 'true'
  const rows = await query(
    `SELECT id, name, description, address, is_active FROM vendors
     ${includeArchived ? '' : 'WHERE is_active = true'}
     ORDER BY name`
  )
  res.json(rows)
})

router.post('/vendors', authMiddleware, requireRole('admin', 'super_admin'), async (req, res) => {
  const { name, description, address } = req.body as { name: string; description?: string; address?: string }
  if (!name?.trim()) { res.status(400).json({ detail: 'name required' }); return }
  const existing = await queryOne('SELECT id FROM vendors WHERE name ILIKE $1', [name.trim()])
  if (existing) { res.status(409).json({ detail: 'A vendor with this name already exists' }); return }
  const rows = await query(
    `INSERT INTO vendors (name, description, address) VALUES ($1, $2, $3)
     RETURNING id, name, description, address, is_active`,
    [name.trim(), description?.trim() ?? null, address?.trim() ?? null]
  )
  res.status(201).json(rows[0])
})

router.put('/vendors/:id', authMiddleware, requireRole('admin', 'super_admin'), async (req, res) => {
  const { name, description, address } = req.body as { name?: string; description?: string; address?: string }
  const sets: string[] = ['updated_at = NOW()']
  const vals: unknown[] = []
  if (name        !== undefined) { vals.push(name?.trim());        sets.push(`name = $${vals.length}`) }
  if (description !== undefined) { vals.push(description?.trim()); sets.push(`description = $${vals.length}`) }
  if (address     !== undefined) { vals.push(address?.trim());     sets.push(`address = $${vals.length}`) }
  vals.push(req.params.id)
  const rows = await query(
    `UPDATE vendors SET ${sets.join(', ')} WHERE id = $${vals.length}
     RETURNING id, name, description, address, is_active`,
    vals
  )
  if (!rows.length) { res.status(404).json({ detail: 'Vendor not found' }); return }
  res.json(rows[0])
})

router.patch('/vendors/:id/archive', authMiddleware, requireRole('admin', 'super_admin'), async (req, res) => {
  const rows = await query(
    `UPDATE vendors SET is_active = false, updated_at = NOW() WHERE id = $1
     RETURNING id, name, is_active`,
    [req.params.id]
  )
  if (!rows.length) { res.status(404).json({ detail: 'Vendor not found' }); return }
  res.json(rows[0])
})

router.patch('/vendors/:id/restore', authMiddleware, requireRole('admin', 'super_admin'), async (req, res) => {
  const rows = await query(
    `UPDATE vendors SET is_active = true, updated_at = NOW() WHERE id = $1
     RETURNING id, name, is_active`,
    [req.params.id]
  )
  if (!rows.length) { res.status(404).json({ detail: 'Vendor not found' }); return }
  res.json(rows[0])
})

// â”€â”€ Budget uploads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/cost-centers/:id/budgets', authMiddleware, requireRole('admin', 'super_admin'),
  upload.single('file'), async (req, res) => {
    const ccId = req.params.id
    const actor = (req as AuthRequest).user
    const { fiscal_year } = req.body as { fiscal_year: string }

    if (!req.file) { res.status(400).json({ detail: 'Excel file required' }); return }
    const cc = await queryOne('SELECT id FROM cost_centers WHERE id = $1', [ccId])
    if (!cc) { res.status(404).json({ detail: 'Cost center not found' }); return }

    // Deactivate previous budget for the same year
    await query(
      'UPDATE budget_uploads SET is_active = false WHERE cost_center_id = $1 AND fiscal_year = $2',
      [ccId, fiscal_year]
    )

    const uploadRows = await query(
      `INSERT INTO budget_uploads (cost_center_id, fiscal_year, file_path, original_filename, uploaded_by_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [ccId, fiscal_year, req.file.path, req.file.originalname, actor.id]
    )
    const budgetUploadId = uploadRows[0].id as string

    // Parse all sheets; use the sheet matching this cost center (or first sheet)
    const cc2 = await queryOne('SELECT code FROM cost_centers WHERE id = $1', [ccId])
    const sheets = await parseBudgetExcel(req.file.path)
    const sheet = sheets.find(s => s.cost_center_code === cc2?.code) ?? sheets[0]

    // Upsert accounts
    const accountIdMap = new Map<string, string>()
    for (const acc of sheet?.accounts ?? []) {
      const rows = await query(
        `INSERT INTO accounts (code, description)
         VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET description = $2, updated_at = NOW()
         RETURNING id`,
        [acc.code, acc.description]
      )
      accountIdMap.set(acc.code, rows[0].id as string)
    }

    // Upsert ITR codes
    const itrIdMap = new Map<string, string>()
    for (const itr of sheet?.itr_codes ?? []) {
      const rows = await query(
        `INSERT INTO itr_codes (code, description)
         VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET description = $2, updated_at = NOW()
         RETURNING id`,
        [itr.code, itr.description]
      )
      itrIdMap.set(itr.code, rows[0].id as string)
    }

    // Insert budget lines
    const lineCount = (sheet?.budget_lines ?? []).length
    for (const line of sheet?.budget_lines ?? []) {
      const accountId = accountIdMap.get(line.account_code) ?? null
      const itrId     = itrIdMap.get(line.itr_code) ?? null
      await query(
        `INSERT INTO budget_lines
           (cost_center_id, budget_upload_id, code, name, allocated_amount, description, account_id, itr_code_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [ccId, budgetUploadId, line.account_code, line.description, line.budget_value,
         line.description, accountId, itrId]
      )
    }

    await logAction({
      entityType: 'BudgetUpload', entityId: budgetUploadId, action: 'uploaded', userId: actor.id,
      details: { cost_center_id: ccId, fiscal_year, lines: lineCount },
    })

    const result = await getBudgetUpload(budgetUploadId)
    res.status(201).json(result)
  }
)

async function getBudgetUpload(id: string) {
  const bu = await queryOne(
    `SELECT bu.id, bu.fiscal_year, bu.original_filename, bu.is_active, bu.created_at,
            u.id AS user_id, u.display_name, u.email, u.role AS user_role
     FROM budget_uploads bu JOIN users u ON u.id = bu.uploaded_by_id WHERE bu.id = $1`,
    [id]
  )
  if (!bu) return null
  const lines = await query(
    'SELECT id, code, name, allocated_amount, is_active FROM budget_lines WHERE budget_upload_id = $1',
    [id]
  )
  return {
    id: bu.id, fiscal_year: bu.fiscal_year, original_filename: bu.original_filename,
    is_active: bu.is_active, created_at: bu.created_at,
    uploaded_by: { id: bu.user_id, display_name: bu.display_name, email: bu.email, role: bu.user_role },
    budget_lines: lines,
  }
}

router.get('/cost-centers/:id/budgets', authMiddleware, async (req, res) => {
  const rows = await query(
    'SELECT id FROM budget_uploads WHERE cost_center_id = $1 ORDER BY created_at DESC',
    [req.params.id]
  )
  const result = await Promise.all(rows.map((r) => getBudgetUpload(r.id as string)))
  res.json(result.filter(Boolean))
})

router.get('/cost-centers/:id/budget-lines', authMiddleware, async (req, res) => {
  const { fiscal_year } = req.query as { fiscal_year?: string }
  let sql = `SELECT bl.id, bl.code, bl.name, bl.allocated_amount, bl.is_active,
                    bl.description, bl.account_id, bl.itr_code_id,
                    a.code  AS account_code,  a.description  AS account_description,
                    it.code AS itr_code,      it.description AS itr_description
             FROM budget_lines bl
             JOIN budget_uploads bu ON bu.id = bl.budget_upload_id
             LEFT JOIN accounts  a  ON a.id  = bl.account_id
             LEFT JOIN itr_codes it ON it.id = bl.itr_code_id
             WHERE bl.cost_center_id = $1 AND bl.is_active = true AND bu.is_active = true`
  const params: unknown[] = [req.params.id]
  if (fiscal_year) { params.push(fiscal_year); sql += ` AND bu.fiscal_year = $${params.length}` }
  sql += ' ORDER BY a.code NULLS LAST, bl.code'
  res.json(await query(sql, params))
})

// â”€â”€ Projects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/cost-centers/:id/projects', authMiddleware, async (req, res) => {
  res.json(await query(
    'SELECT id, code, name, description, is_active FROM projects WHERE cost_center_id = $1 AND is_active = true',
    [req.params.id]
  ))
})

router.post('/cost-centers/:id/projects', authMiddleware, async (req, res) => {
  const actor = (req as AuthRequest).user
  const { code, name, description } = req.body as { code: string; name: string; description?: string }
  if (!code || !name) { res.status(400).json({ detail: 'code and name required' }); return }
  const rows = await query(
    'INSERT INTO projects (cost_center_id, code, name, description, created_by_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, code, name, description, is_active',
    [req.params.id, code, name, description ?? null, actor.id]
  )
  res.status(201).json(rows[0])
})

export default router
