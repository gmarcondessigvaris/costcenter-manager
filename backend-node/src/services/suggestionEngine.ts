import { query } from '../db.ts'

export interface BudgetLineSuggestion {
  budget_line_id: string
  budget_line_name: string
  budget_line_code: string
  confidence: number
}

export async function suggestBudgetLines(
  vendorId: string,
  costCenterId: string,
  limit = 3
): Promise<BudgetLineSuggestion[]> {
  const rows = await query<{ budget_line_id: string; freq: string }>(
    `SELECT ia.budget_line_id, COUNT(ia.id)::text AS freq
     FROM invoice_allocations ia
     JOIN invoices i ON i.id = ia.invoice_id
     WHERE i.vendor_id = $1
       AND i.cost_center_id = $2
       AND i.status IN ('approved', 'pending_approval')
       AND ia.budget_line_id IS NOT NULL
     GROUP BY ia.budget_line_id
     ORDER BY freq DESC
     LIMIT $3`,
    [vendorId, costCenterId, limit]
  )

  if (!rows.length) return []

  const total = rows.reduce((sum, r) => sum + Number(r.freq), 0)

  const suggestions: BudgetLineSuggestion[] = []
  for (const row of rows) {
    const bl = await query<{ id: string; name: string; code: string; is_active: boolean }>(
      'SELECT id, name, code, is_active FROM budget_lines WHERE id = $1',
      [row.budget_line_id]
    )
    if (bl[0]?.is_active) {
      suggestions.push({
        budget_line_id: bl[0].id,
        budget_line_name: bl[0].name,
        budget_line_code: bl[0].code,
        confidence: Math.round((Number(row.freq) / total) * 100) / 100,
      })
    }
  }

  return suggestions
}
