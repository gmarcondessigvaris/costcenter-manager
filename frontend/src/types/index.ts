export type UserRole = 'admin' | 'finance' | 'user'

export interface User {
  id: string
  email: string
  display_name: string
  role: UserRole
  is_active: boolean
}

export interface CostCenterMember {
  id: string
  user: User
  role: 'owner' | 'viewer'
}

export interface CostCenter {
  id: string
  code: string
  name: string
  is_active: boolean
  members: CostCenterMember[]
}

export interface Account {
  id: string
  code: string
  description: string
  is_active: boolean
}

export interface ItrCode {
  id: string
  code: string
  description: string
  is_active: boolean
}

export interface BudgetLine {
  id: string
  code: string
  name: string
  allocated_amount: number
  is_active: boolean
  // enriched fields
  description?: string
  account_id?: string
  account_code?: string
  account_description?: string
  itr_code_id?: string
  itr_code?: string
  itr_description?: string
}

export interface BudgetUpload {
  id: string
  fiscal_year: string
  original_filename: string
  is_active: boolean
  uploaded_by: User
  created_at: string
  budget_lines: BudgetLine[]
}

export interface Vendor {
  id: string
  name: string
}

export interface Project {
  id: string
  code: string
  name: string
  description?: string
  is_active: boolean
}

export type InvoiceStatus = 'pending_assignment' | 'pending_approval' | 'approved' | 'rejected'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface Allocation {
  id: string
  budget_line: BudgetLine | null
  project: Project | null
  amount: number
  notes?: string
}

export interface ApprovalStep {
  id: string
  step_order: number
  approver: User
  status: ApprovalStatus
  comment?: string
  decided_at?: string
}

export interface Invoice {
  id: string
  invoice_number?: string
  status: InvoiceStatus
  vendor: Vendor
  cost_center_id: string
  pdf_path?: string
  original_filename?: string
  amount?: number
  due_date?: string
  notes?: string
  uploaded_by: User
  created_at: string
  allocations: Allocation[]
  approval_steps: ApprovalStep[]
}

export interface AuditEntry {
  id: string
  action: string
  user: string
  details: Record<string, unknown>
  created_at: string
}

export interface InvoiceSuggestion {
  budget_line_id: string
  budget_line_name: string
  budget_line_code: string
  confidence: number
}
