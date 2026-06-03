import { query } from '../db.ts'

export async function logAction(opts: {
  entityType: string
  entityId?: string | null
  action: string
  userId?: string | null
  invoiceId?: string | null
  details?: Record<string, unknown> | null
}): Promise<void> {
  await query(
    `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, invoice_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      opts.entityType,
      opts.entityId ?? null,
      opts.action,
      opts.userId ?? null,
      opts.invoiceId ?? null,
      opts.details ? JSON.stringify(opts.details) : null,
    ]
  )
}
