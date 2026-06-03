import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.ts'
import { query, queryOne } from '../db.ts'
import type { AuthRequest } from '../types.ts'

const router = Router()

router.get('/reports/cost-centers/:id', authMiddleware, async (req, res) => {
  const user = (req as AuthRequest).user
  const ccId = req.params.id
  const fiscalYear = (req.query.fiscal_year as string) || new Date().getFullYear().toString()

  // Access check
  if (user.role !== 'super_admin' && user.role !== 'admin') {
    const member = await queryOne(
      'SELECT id FROM cost_center_members WHERE cost_center_id = $1 AND user_id = $2',
      [ccId, user.id]
    )
    if (!member) { res.status(403).json({ detail: 'Not a member of this cost center' }); return }
  }

  const cc = await queryOne(
    'SELECT id, code, name FROM cost_centers WHERE id = $1',
    [ccId]
  )
  if (!cc) { res.status(404).json({ detail: 'Cost center not found' }); return }

  // Budget lines with account + ITR info
  const budgetLines = await query(
    `SELECT bl.id, bl.allocated_amount AS budget_value,
            bl.description, bl.code AS raw_code,
            a.code  AS account_code,  a.description AS account_description,
            it.code AS itr_code,      it.description AS itr_description
     FROM budget_lines bl
     JOIN budget_uploads bu ON bu.id = bl.budget_upload_id
     LEFT JOIN accounts  a  ON a.id  = bl.account_id
     LEFT JOIN itr_codes it ON it.id = bl.itr_code_id
     WHERE bl.cost_center_id = $1
       AND bl.is_active = true
       AND bu.is_active = true
       AND bu.fiscal_year = $2
     ORDER BY a.code NULLS LAST, bl.code`,
    [ccId, fiscalYear]
  )

  // All approved invoice allocations â€” amounts converted to CHF via exchange_rate
  const allocations = await query(
    `SELECT ia.id, ia.budget_line_id, ia.project_id,
            ia.amount,
            ia.amount * COALESCE(i.exchange_rate, 1) AS amount_chf,
            i.id AS invoice_id, i.invoice_number, i.status, i.due_date,
            i.amount AS invoice_amount,
            i.amount * COALESCE(i.exchange_rate, 1) AS invoice_amount_chf,
            i.currency, i.exchange_rate,
            v.name AS vendor_name,
            p.code AS project_code, p.name AS project_name
     FROM invoice_allocations ia
     JOIN invoices i ON i.id = ia.invoice_id
     JOIN vendors  v ON v.id = i.vendor_id
     LEFT JOIN projects p ON p.id = ia.project_id
     WHERE i.cost_center_id = $1
       AND i.status = 'approved'
     ORDER BY i.created_at DESC`,
    [ccId]
  )

  // Group allocations by budget_line_id
  const byLine = new Map<string, typeof allocations>()
  const projectAllocations: typeof allocations = []

  for (const a of allocations) {
    if (a.budget_line_id) {
      const arr = byLine.get(a.budget_line_id as string) ?? []
      arr.push(a)
      byLine.set(a.budget_line_id as string, arr)
    } else {
      projectAllocations.push(a)
    }
  }

  // Build report lines
  let totalBudget = 0
  let totalSpent  = 0

  const lines = budgetLines.map(bl => {
    const lineAllocs = byLine.get(bl.id as string) ?? []
    const spent = lineAllocs.reduce((s, a) => s + Number(a.amount_chf), 0)
    totalBudget += Number(bl.budget_value)
    totalSpent  += spent

    return {
      id: bl.id,
      account_code: bl.account_code ?? bl.raw_code,
      account_description: bl.account_description ?? bl.description,
      itr_code: bl.itr_code,
      itr_description: bl.itr_description,
      description: bl.description,
      budget_value: Number(bl.budget_value),
      spent,
      remaining: Number(bl.budget_value) - spent,
      invoices: lineAllocs.map(a => ({
        allocation_id: a.id,
        invoice_id: a.invoice_id,
        invoice_number: a.invoice_number,
        vendor_name: a.vendor_name,
        currency: a.currency,
        exchange_rate: Number(a.exchange_rate),
        invoice_amount: Number(a.invoice_amount),
        invoice_amount_chf: Number(a.invoice_amount_chf),
        allocated_amount: Number(a.amount),
        allocated_amount_chf: Number(a.amount_chf),
        due_date: a.due_date,
        status: a.status,
      })),
    }
  })

  // Project allocations (not tied to a budget line)
  const projectLines = projectAllocations.map(a => ({
    allocation_id: a.id,
    invoice_id: a.invoice_id,
    invoice_number: a.invoice_number,
    vendor_name: a.vendor_name,
    currency: a.currency,
    exchange_rate: Number(a.exchange_rate),
    invoice_amount: Number(a.invoice_amount),
    invoice_amount_chf: Number(a.invoice_amount_chf),
    allocated_amount: Number(a.amount),
    allocated_amount_chf: Number(a.amount_chf),
    due_date: a.due_date,
    status: a.status,
    project_code: a.project_code,
    project_name: a.project_name,
  }))

  totalSpent += projectAllocations.reduce((s, a) => s + Number(a.amount_chf), 0)

  res.json({
    cost_center: cc,
    fiscal_year: fiscalYear,
    summary: {
      total_budget: totalBudget,
      total_spent: totalSpent,
      total_remaining: totalBudget - totalSpent,
      pct_used: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
    },
    budget_lines: lines,
    project_allocations: projectLines,
  })
})

export default router
