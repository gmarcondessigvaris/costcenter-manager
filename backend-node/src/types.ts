import type { Request } from 'express'

export type UserRole = 'super_admin' | 'admin' | 'user'
export type MemberRole = 'owner' | 'cc_owner'
export type InvoiceStatus = 'pending_assignment' | 'pending_approval' | 'approved' | 'rejected'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface DbUser {
  id: string
  azure_id: string
  email: string
  display_name: string
  role: UserRole
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export interface AuthRequest extends Request {
  user: DbUser
}
