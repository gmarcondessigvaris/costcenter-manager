import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { authMiddleware } from '../middleware/auth.ts'
import { query, queryOne, withTransaction } from '../db.ts'
import { logAction } from '../services/audit.ts'
import { suggestBudgetLines } from '../services/suggestionEngine.ts'
import type { AuthRequest } from '../types.ts'

const router = Router()
const uploadDir = process.env.UPLOAD_DIR ?? 'uploads'

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(path.join(uploadDir, 'invoices'), { recursive: true })
    cb(null, path.join(uploadDir, 'invoices'))
  },
  filename: (_req, file, cb) => cb(null, `${uuidv4()}_${file.originalname}`),
})
const upload = multer({ storage, fileFilter: (_req, file, cb) => cb(null, /\.pdf$/i.test(file.originalname)) })

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getInvoice(id: string) {
  const inv = await queryOne(
    `SELECT i.*,
            v.id AS vendor_id, v.name AS vendor_name,
            u.id AS uploader_id, u.display_name AS uploader_name, u.email AS uploader_email, u.role AS uploader_role
     FROM invoices i
     JOIN vendors v ON v.id = i.vendor_id
     JOIN users u ON u.id = i.uploaded_by_id
     WHERE i.id = $1`,
    [id]
  )
  if (!inv) return null

  const allocations = await query(
    `SELECT ia.id, ia.amount, ia.notes,
            bl.id AS bl_id, bl.code AS bl_code, bl.name AS bl_name, bl.allocated_amount AS bl_amount,
            pr.id AS pr_id, pr.code AS pr_code, pr.name AS pr_name, pr.description AS pr_desc
     FROM invoice_allocations ia
     LEFT JOIN budget_lines bl ON bl.id = ia.budget_line_id
     LEFT JOIN projects pr ON pr.id = ia.project_id
     WHERE ia.invoice_id = $1`,
    [id]
  )

  const steps = await query(
    `SELECT aps.id, aps.step_order, aps.status, aps.comment, aps.decided_at,
            u.id AS approver_id, u.display_name, u.email, u.role AS approver_role
     FROM approval_steps aps
     JOIN users u ON u.id = aps.approver_id
     WHERE aps.invoice_id = $1
     ORDER BY aps.step_order`,
    [id]
  )

  return {
    id: inv.id, invoice_number: inv.invoice_number, status: inv.status,
    cost_center_id: inv.cost_center_id, pdf_path: inv.pdf_path, original_filename: inv.original_filename,
    amount: inv.amount, due_date: inv.due_date, notes: inv.notes, created_at: inv.created_at,
    vendor: { id: inv.vendor_id, name: inv.vendor_name },
    uploaded_by: { id: inv.uploader_id, display_name: inv.uploader_name, email: inv.uploader_email, role: inv.uploader_role },
    allocations: allocations.map((a) => ({
      id: a.id, amount: a.amount, notes: a.notes,
      budget_line: a.bl_id ? { id: a.bl_id, code: a.bl_code, name: a.bl_name, allocated_amount: a.bl_amount, is_active: true } : null,
      project: a.pr_id ? { id: a.pr_id, code: a.pr_code, name: a.pr_name, description: a.pr_desc, is_active: true } : null,
    })),
    approval_steps: steps.map((s) => ({
      id: s.id, step_order: s.step_order, status: s.status, comment: s.comment, decided_at: s.decided_at,
      approver: { id: s.approver_id, display_name: s.display_name, email: s.email, role: s.approver_role, is_active: true },
    })),
  }
}

async function assertMemberAccess(invoiceCostCenterId: string, user: AuthRequest['user'], res: ReturnType<Router['use']> extends never ? never : Parameters<Parameters<Router['use']>[0]>[1]): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'finance') return true
  const m = await queryOne(
    'SELECT id FROM cost_center_members WHERE cost_center_id = $1 AND user_id = $2',
    [invoiceCostCenterId, user.id]
  )
  const isApprover = await queryOne(
    `SELECT aps.id FROM approval_steps aps JOIN invoices i ON i.id = aps.invoice_id
     WHERE i.cost_center_id = $1 AND aps.approver_id = $2`,
    [invoiceCostCenterId, user.id]
  )
  if (!m && !isApprover) {
    (res as any).status(403).json({ detail: 'Not a member of this cost center' })
    return false
  }
  return true
}

// â”€â”€ Upload (Finance) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/invoices', authMiddleware, upload.single('file'), async (req, res) => {
  const actor = (req as AuthRequest).user
  if (actor.role !== 'finance' && actor.role !== 'admin') {
    res.status(403).json({ detail: 'Finance role required' }); return
  }

  const { cost_center_id, vendor_id, invoice_number } = req.body as {
    cost_center_id: string; vendor_id: string; invoice_number?: string
  }
  if (!req.file) { res.status(400).json({ detail: 'PDF file required' }); return }

  const cc = await queryOne('SELECT id FROM cost_centers WHERE id = $1', [cost_center_id])
  if (!cc) { res.status(404).json({ detail: 'Cost center not found' }); return }
  const vendor = await queryOne('SELECT id FROM vendors WHERE id = $1', [vendor_id])
  if (!vendor) { res.status(404).json({ detail: 'Vendor not found' }); return }

  const rows = await query(
    `INSERT INTO invoices (invoice_number, cost_center_id, vendor_id, pdf_path, original_filename, uploaded_by_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [invoice_number ?? null, cost_center_id, vendor_id, req.file.path, req.file.originalname, actor.id]
  )
  const invoiceId = rows[0].id as string
  await logAction({ entityType: 'Invoice', entityId: invoiceId, action: 'uploaded', userId: actor.id, invoiceId, details: { cost_center_id, vendor_id } })
  res.status(201).json(await getInvoice(invoiceId))
})

// â”€â”€ List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/invoices', authMiddleware, async (req, res) => {
  const actor = (req as AuthRequest).user
  const { status, cost_center_id } = req.query as { status?: string; cost_center_id?: string }

  let sql = 'SELECT i.id FROM invoices i WHERE 1=1'
  const params: unknown[] = []

  if (actor.role !== 'admin' && actor.role !== 'finance') {
    sql += ` AND (i.cost_center_id IN (
               SELECT cost_center_id FROM cost_center_members WHERE user_id = $${params.length + 1})
             OR i.id IN (
               SELECT invoice_id FROM approval_steps WHERE approver_id = $${params.length + 1}))`
    params.push(actor.id)
  }
  if (status) { params.push(status); sql += ` AND i.status = $${params.length}` }
  if (cost_center_id) { params.push(cost_center_id); sql += ` AND i.cost_center_id = $${params.length}` }
  sql += ' ORDER BY i.created_at DESC'

  const rows = await query(sql, params)
  const invoices = await Promise.all(rows.map((r) => getInvoice(r.id as string)))
  res.json(invoices.filter(Boolean))
})

// â”€â”€ Detail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/invoices/:id', authMiddleware, async (req, res) => {
  const actor = (req as AuthRequest).user
  const inv = await queryOne('SELECT id, cost_center_id FROM invoices WHERE id = $1', [req.params.id])
  if (!inv) { res.status(404).json({ detail: 'Invoice not found' }); return }
  if (!await assertMemberAccess(inv.cost_center_id as string, actor, res)) return
  res.json(await getInvoice(req.params.id))
})

// â”€â”€ PDF download â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/invoices/:id/pdf', authMiddleware, async (req, res) => {
  const actor = (req as AuthRequest).user
  const inv = await queryOne('SELECT id, cost_center_id, pdf_path, original_filename FROM invoices WHERE id = $1', [req.params.id])
  if (!inv) { res.status(404).json({ detail: 'Invoice not found' }); return }
  if (!await assertMemberAccess(inv.cost_center_id as string, actor, res)) return
  const filePath = inv.pdf_path as string
  if (!filePath || !fs.existsSync(filePath)) { res.status(404).json({ detail: 'PDF not found on disk' }); return }
  res.download(filePath, (inv.original_filename as string) ?? 'invoice.pdf')
})

// â”€â”€ Suggestions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/invoices/:id/suggestions', authMiddleware, async (req, res) => {
  const inv = await queryOne('SELECT id, vendor_id, cost_center_id FROM invoices WHERE id = $1', [req.params.id])
  if (!inv) { res.status(404).json({ detail: 'Invoice not found' }); return }
  res.json(await suggestBudgetLines(inv.vendor_id as string, inv.cost_center_id as string))
})

// â”€â”€ Assign (Cost center owner) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.put('/invoices/:id/assign', authMiddleware, async (req, res) => {
  try {
  const actor = (req as AuthRequest).user
  const inv = await queryOne('SELECT id, cost_center_id, status FROM invoices WHERE id = $1', [req.params.id])
  if (!inv) { res.status(404).json({ detail: 'Invoice not found' }); return }
  if (!await assertMemberAccess(inv.cost_center_id as string, actor, res)) return
  if (inv.status !== 'pending_assignment') {
    res.status(409).json({ detail: `Invoice is already in status '${inv.status}'` }); return
  }

  const { amount, due_date, notes, allocations, approver_1_id, approver_2_id,
          currency = 'CHF', exchange_rate_mode = 'auto', exchange_rate: manualRate } = req.body as {
    amount: number; due_date: string; notes?: string
    currency?: string; exchange_rate_mode?: string; exchange_rate?: number
    allocations: Array<{ budget_line_id?: string; project_id?: string; amount: number; notes?: string }>
    approver_1_id: string; approver_2_id: string
  }

  if (!allocations?.length) { res.status(400).json({ detail: 'At least one allocation required' }); return }
  if (approver_1_id === approver_2_id) { res.status(400).json({ detail: 'The two approvers must be different people' }); return }

  const a1 = await queryOne('SELECT id FROM users WHERE id = $1', [approver_1_id])
  const a2 = await queryOne('SELECT id FROM users WHERE id = $1', [approver_2_id])
  if (!a1 || !a2) { res.status(400).json({ detail: 'One or both approvers not found' }); return }

  // Resolve exchange rate
  let exchangeRate = 1.0
  if (currency === 'CHF') {
    exchangeRate = 1.0
  } else if (exchange_rate_mode === 'manual' && manualRate) {
    exchangeRate = manualRate
  } else {
    const cur = await queryOne('SELECT rate_to_chf FROM currencies WHERE code = $1 AND is_active = true', [currency])
    exchangeRate = cur ? Number(cur.rate_to_chf) : 1.0
  }

  await withTransaction(async (q) => {
    await q(
      `UPDATE invoices SET amount=$1, due_date=$2, notes=$3, status=$4,
         currency=$5, exchange_rate=$6, exchange_rate_mode=$7, updated_at=NOW()
       WHERE id=$8`,
      [amount, due_date, notes ?? null, 'pending_approval',
       currency, exchangeRate, exchange_rate_mode, inv.id]
    )
    await q('DELETE FROM invoice_allocations WHERE invoice_id = $1', [inv.id])
    for (const alloc of allocations) {
      await q(
        'INSERT INTO invoice_allocations (invoice_id, budget_line_id, project_id, amount, notes) VALUES ($1,$2,$3,$4,$5)',
        [inv.id, alloc.budget_line_id ?? null, alloc.project_id ?? null, alloc.amount, alloc.notes ?? null]
      )
    }
    await q('DELETE FROM approval_steps WHERE invoice_id = $1', [inv.id])
    await q('INSERT INTO approval_steps (invoice_id, approver_id, step_order) VALUES ($1,$2,1)', [inv.id, approver_1_id])
    await q('INSERT INTO approval_steps (invoice_id, approver_id, step_order) VALUES ($1,$2,2)', [inv.id, approver_2_id])
  })

  await logAction({
    entityType: 'Invoice', entityId: inv.id as string, action: 'assigned',
    userId: actor.id, invoiceId: inv.id as string,
    details: { amount, due_date, approver_1_id, approver_2_id, allocations: allocations.length },
  })
  res.json(await getInvoice(req.params.id))
  } catch (err: any) {
    console.error('[assign invoice]', err)
    res.status(500).json({ detail: err?.message ?? 'Unexpected error during invoice assignment' })
  }
})

// â”€â”€ Approve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/invoices/:id/approve', authMiddleware, async (req, res) => {
  const actor = (req as AuthRequest).user
  const { comment } = req.body as { comment?: string }
  const inv = await queryOne('SELECT id, status FROM invoices WHERE id = $1', [req.params.id])
  if (!inv) { res.status(404).json({ detail: 'Invoice not found' }); return }
  if (inv.status !== 'pending_approval') { res.status(409).json({ detail: 'Invoice is not awaiting approval' }); return }

  const steps = await query(
    'SELECT id, step_order, status, approver_id FROM approval_steps WHERE invoice_id = $1 ORDER BY step_order',
    [inv.id]
  )
  const activeStep = steps.find((s) => s.approver_id === actor.id && s.status === 'pending')
  if (!activeStep) { res.status(403).json({ detail: 'You have no pending approval step for this invoice' }); return }

  const priorPending = steps.find((s) => Number(s.step_order) < Number(activeStep.step_order) && s.status === 'pending')
  if (priorPending) { res.status(409).json({ detail: 'A prior approval step is still pending' }); return }

  await query(
    'UPDATE approval_steps SET status=$1, comment=$2, decided_at=NOW(), updated_at=NOW() WHERE id=$3',
    ['approved', comment ?? null, activeStep.id]
  )

  const allApproved = steps.every((s) => s.id === activeStep.id || s.status === 'approved')
  if (allApproved) {
    await query('UPDATE invoices SET status=$1, updated_at=NOW() WHERE id=$2', ['approved', inv.id])
  }

  await logAction({
    entityType: 'Invoice', entityId: inv.id as string, action: 'step_approved',
    userId: actor.id, invoiceId: inv.id as string,
    details: { step_order: activeStep.step_order, comment, invoice_fully_approved: allApproved },
  })
  res.json(await getInvoice(req.params.id))
})

// â”€â”€ Reject â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/invoices/:id/reject', authMiddleware, async (req, res) => {
  const actor = (req as AuthRequest).user
  const { comment } = req.body as { comment?: string }
  const inv = await queryOne('SELECT id, status FROM invoices WHERE id = $1', [req.params.id])
  if (!inv) { res.status(404).json({ detail: 'Invoice not found' }); return }
  if (inv.status !== 'pending_approval') { res.status(409).json({ detail: 'Invoice is not awaiting approval' }); return }

  const steps = await query(
    'SELECT id, step_order, approver_id, status FROM approval_steps WHERE invoice_id = $1 ORDER BY step_order',
    [inv.id]
  )
  const activeStep = steps.find((s) => s.approver_id === actor.id && s.status === 'pending')
  if (!activeStep) { res.status(403).json({ detail: 'You have no pending approval step for this invoice' }); return }

  await query(
    'UPDATE approval_steps SET status=$1, comment=$2, decided_at=NOW(), updated_at=NOW() WHERE id=$3',
    ['rejected', comment ?? null, activeStep.id]
  )
  await query('UPDATE invoices SET status=$1, updated_at=NOW() WHERE id=$2', ['rejected', inv.id])

  await logAction({
    entityType: 'Invoice', entityId: inv.id as string, action: 'step_rejected',
    userId: actor.id, invoiceId: inv.id as string,
    details: { step_order: activeStep.step_order, comment },
  })
  res.json(await getInvoice(req.params.id))
})

// â”€â”€ Audit log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/invoices/:id/audit-log', authMiddleware, async (req, res) => {
  const actor = (req as AuthRequest).user
  const inv = await queryOne('SELECT id, cost_center_id FROM invoices WHERE id = $1', [req.params.id])
  if (!inv) { res.status(404).json({ detail: 'Invoice not found' }); return }
  if (!await assertMemberAccess(inv.cost_center_id as string, actor, res)) return

  const logs = await query(
    `SELECT al.id, al.action, al.details, al.created_at,
            COALESCE(u.display_name, 'System') AS user_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.invoice_id = $1
     ORDER BY al.created_at ASC`,
    [inv.id]
  )
  res.json(logs.map((l) => ({ id: l.id, action: l.action, user: l.user_name, details: l.details, created_at: l.created_at })))
})

export default router
