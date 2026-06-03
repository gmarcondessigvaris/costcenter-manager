import axios from 'axios'
import type {
  Account, AuditEntry, BudgetLine, BudgetUpload, CostCenter,
  Invoice, InvoiceSuggestion, ItrCode, Project, User, Vendor,
} from '../types'

const api = axios.create({ baseURL: '/api' })

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  } else {
    delete api.defaults.headers.common['Authorization']
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const getMe = () => api.get<User>('/auth/me').then(r => r.data)

// ── Users ─────────────────────────────────────────────────────────────────────
export const searchUsers = (q: string) =>
  api.get<User[]>('/users/search', { params: { q } }).then(r => r.data)

export const listUsers = () => api.get<User[]>('/users').then(r => r.data)

export const createUser = (data: { display_name: string; email: string; role: string }) =>
  api.post<User>('/users', data).then(r => r.data)

export const updateUserRole = (userId: string, role: string) =>
  api.put<User>(`/users/${userId}/role`, { role }).then(r => r.data)

// ── Cost Centers ──────────────────────────────────────────────────────────────
export const listCostCenters = () =>
  api.get<CostCenter[]>('/cost-centers').then(r => r.data)

export const createCostCenter = (data: { code: string; name: string }) =>
  api.post<CostCenter>('/cost-centers', data).then(r => r.data)

export const updateCostCenter = (id: string, data: { name?: string; is_active?: boolean }) =>
  api.put<CostCenter>(`/cost-centers/${id}`, data).then(r => r.data)

export const addMember = (ccId: string, userId: string, role: string) =>
  api.post<CostCenter>(`/cost-centers/${ccId}/members`, { user_id: userId, role }).then(r => r.data)

export const removeMember = (ccId: string, userId: string) =>
  api.delete(`/cost-centers/${ccId}/members/${userId}`)

// ── Vendors ───────────────────────────────────────────────────────────────────
export const listVendors = () => api.get<Vendor[]>('/vendors').then(r => r.data)

export const createVendor = (name: string) =>
  api.post<Vendor>('/vendors', { name }).then(r => r.data)

// ── Budgets ───────────────────────────────────────────────────────────────────
export const listBudgetUploads = (ccId: string) =>
  api.get<BudgetUpload[]>(`/cost-centers/${ccId}/budgets`).then(r => r.data)

export const listBudgetLines = (ccId: string, fiscalYear?: string) =>
  api.get<BudgetLine[]>(`/cost-centers/${ccId}/budget-lines`, {
    params: fiscalYear ? { fiscal_year: fiscalYear } : {},
  }).then(r => r.data)

export const uploadBudget = (ccId: string, fiscalYear: string, file: File) => {
  const form = new FormData()
  form.append('fiscal_year', fiscalYear)
  form.append('file', file)
  return api.post<BudgetUpload>(`/cost-centers/${ccId}/budgets`, form).then(r => r.data)
}

// ── Projects ──────────────────────────────────────────────────────────────────
export const listProjects = (ccId: string) =>
  api.get<Project[]>(`/cost-centers/${ccId}/projects`).then(r => r.data)

export const createProject = (ccId: string, data: { code: string; name: string; description?: string }) =>
  api.post<Project>(`/cost-centers/${ccId}/projects`, data).then(r => r.data)

// ── Invoices ──────────────────────────────────────────────────────────────────
export const listInvoices = (params?: { status?: string; cost_center_id?: string }) =>
  api.get<Invoice[]>('/invoices', { params }).then(r => r.data)

export const getInvoice = (id: string) =>
  api.get<Invoice>(`/invoices/${id}`).then(r => r.data)

export const uploadInvoice = (data: {
  cost_center_id: string
  vendor_id: string
  invoice_number?: string
  file: File
}) => {
  const form = new FormData()
  form.append('cost_center_id', data.cost_center_id)
  form.append('vendor_id', data.vendor_id)
  if (data.invoice_number) form.append('invoice_number', data.invoice_number)
  form.append('file', data.file)
  return api.post<Invoice>('/invoices', form).then(r => r.data)
}

export const assignInvoice = (
  id: string,
  data: {
    amount: number
    due_date: string
    notes?: string
    allocations: Array<{
      budget_line_id?: string
      project_id?: string
      amount: number
      notes?: string
    }>
    approver_1_id: string
    approver_2_id: string
  }
) => api.put<Invoice>(`/invoices/${id}/assign`, data).then(r => r.data)

export const approveInvoice = (id: string, comment?: string) =>
  api.post<Invoice>(`/invoices/${id}/approve`, { comment }).then(r => r.data)

export const rejectInvoice = (id: string, comment?: string) =>
  api.post<Invoice>(`/invoices/${id}/reject`, { comment }).then(r => r.data)

export const getInvoiceSuggestions = (id: string) =>
  api.get<InvoiceSuggestion[]>(`/invoices/${id}/suggestions`).then(r => r.data)

export const getInvoiceAuditLog = (id: string) =>
  api.get<AuditEntry[]>(`/invoices/${id}/audit-log`).then(r => r.data)

export const getInvoicePdfUrl = (id: string) => `/api/invoices/${id}/pdf`

// ── Accounts & ITR codes ──────────────────────────────────────────────────────
export const listAccounts = () => api.get<Account[]>('/accounts').then(r => r.data)
export const listItrCodes = () => api.get<ItrCode[]>('/itr-codes').then(r => r.data)

// ── Reports ───────────────────────────────────────────────────────────────────
export const getCostCenterReport = (ccId: string, fiscalYear: string) =>
  api.get(`/reports/cost-centers/${ccId}`, { params: { fiscal_year: fiscalYear } }).then(r => r.data)
