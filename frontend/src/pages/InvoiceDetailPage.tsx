import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { format, differenceInDays } from 'date-fns'
import {
  getInvoice, listBudgetLines, listBudgetUploads, listProjects, searchUsers,
  assignInvoice, approveInvoice, rejectInvoice,
  getInvoiceSuggestions, getInvoiceAuditLog, getInvoicePdfBlob,
  listCurrencies,
} from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import type { ApprovalStep, InvoiceSuggestion, User } from '../types'

const CHF = (n: number) => n.toLocaleString('de-CH', { style: 'currency', currency: 'CHF' })

// ── User search ───────────────────────────────────────────────────────────────

function UserSearch({ label, value, onChange }: { label: string; value: User | null; onChange: (u: User) => void }) {
  const [q, setQ]       = useState('')
  const [open, setOpen] = useState(false)
  const { data: results = [] } = useQuery({
    queryKey: ['user-search', q],
    queryFn: () => searchUsers(q),
    enabled: q.length >= 2,
  })
  return (
    <div className="relative">
      <label className="label">{label}</label>
      {value ? (
        <div className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg bg-gray-50">
          <div className="w-6 h-6 rounded-full bg-sigvaris-blue text-white text-xs flex items-center justify-center font-bold">{value.display_name[0]}</div>
          <span className="text-sm flex-1">{value.display_name}</span>
          <button type="button" onClick={() => { onChange(null as any); setQ('') }} className="text-gray-400 hover:text-gray-600 text-xs">×</button>
        </div>
      ) : (
        <div className="relative">
          <input type="text" className="input" placeholder="Search by name or email…" value={q}
            onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} />
          {open && results.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {results.map(u => (
                <li key={u.id} className="px-3 py-2 text-sm hover:bg-sigvaris-blue-pale cursor-pointer"
                  onMouseDown={() => { onChange(u); setQ(''); setOpen(false) }}>
                  <span className="font-medium">{u.display_name}</span>
                  <span className="text-gray-400 ml-2">{u.email}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ── Assignment form ───────────────────────────────────────────────────────────

interface AllocationRow { type: 'budget_line' | 'project'; target_id: string; amount: string; notes: string }
interface AssignForm   { amount: string; invoice_date: string; notes: string; allocations: AllocationRow[] }

function AssignmentForm({ invoiceId, costCenterId, onDone }: {
  invoiceId: string; costCenterId: string; onDone: () => void
}) {
  const { user: currentUser } = useAuth()
  const qc = useQueryClient()
  const [approver1, setApprover1]         = useState<User | null>(null)
  const [approver2, setApprover2]         = useState<User | null>(null)
  const [error, setError]                 = useState('')
  const [currency, setCurrency]           = useState('CHF')
  const [budgetYear, setBudgetYear]       = useState('')

  // Load available budget years for this cost center
  const { data: budgetUploads = [] } = useQuery({
    queryKey: ['budget-uploads', costCenterId],
    queryFn: () => listBudgetUploads(costCenterId),
  })
  const availableYears = [...new Set(
    (budgetUploads as any[]).filter((u: any) => u.is_active).map((u: any) => u.fiscal_year)
  )].sort((a, b) => b.localeCompare(a))

  // Auto-select current year if available
  const effectiveYear = budgetYear || availableYears[0] || ''

  const { data: budgetLines = [] } = useQuery({
    queryKey: ['budget-lines', costCenterId, effectiveYear],
    queryFn: () => listBudgetLines(costCenterId, effectiveYear || undefined),
    enabled: !!costCenterId,
  })
  const { data: projects = [] }    = useQuery({ queryKey: ['projects', costCenterId],     queryFn: () => listProjects(costCenterId) })
  const { data: currencies = [] }  = useQuery({ queryKey: ['currencies'],                 queryFn: listCurrencies })
  const { data: suggestions = [] } = useQuery({ queryKey: ['suggestions', invoiceId],    queryFn: () => getInvoiceSuggestions(invoiceId) })
  const activeCurrencies = (currencies as any[]).filter((c: any) => c.is_active)

  const { register, control, handleSubmit, watch, setValue } = useForm<AssignForm>({
    defaultValues: { amount: '', invoice_date: '', notes: '', allocations: [{ type: 'budget_line', target_id: '', amount: '', notes: '' }] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'allocations' })

  const watchedAmount = watch('amount')
  useEffect(() => {
    if (fields.length === 1 && watchedAmount) setValue('allocations.0.amount', watchedAmount)
  }, [watchedAmount, fields.length])

  const allAllocAmounts = watch('allocations').map(a => parseFloat(a.amount) || 0)
  const totalAllocated  = allAllocAmounts.reduce((s, a) => s + a, 0)
  const invoiceTotal    = parseFloat(watchedAmount) || 0
  const remaining       = invoiceTotal - totalAllocated
  const multiLine       = fields.length > 1

  const watchedDate = watch('invoice_date')
  const dateWarning = useMemo(() => {
    if (!watchedDate) return null
    const days = differenceInDays(new Date(), new Date(watchedDate))
    return days > 30 ? `Invoice date is ${days} days ago — please verify.` : null
  }, [watchedDate])

  const assignMut = useMutation({
    mutationFn: (data: Parameters<typeof assignInvoice>[1]) => assignInvoice(invoiceId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoice', invoiceId] }); onDone() },
    onError: (e: any) => setError(e.response?.data?.detail || 'Failed to assign invoice'),
  })

  function onSubmit(form: AssignForm) {
    setError('')
    if (!approver1 || !approver2) return setError('Please select both approvers')
    if (approver1.id === approver2.id) return setError('Approvers must be different people')
    if (multiLine && invoiceTotal > 0 && Math.abs(remaining) > 0.01)
      return setError(`Allocation total (${CHF(totalAllocated)}) must equal invoice amount (${CHF(invoiceTotal)})`)

    const isSelfApprover1 = currentUser?.id === approver1.id

    assignMut.mutate({
      amount: parseFloat(form.amount), due_date: form.invoice_date,
      notes: form.notes || undefined, currency,
      allocations: form.allocations.map(a => ({
        budget_line_id: a.type === 'budget_line' ? a.target_id : undefined,
        project_id:     a.type === 'project'     ? a.target_id : undefined,
        amount: parseFloat(a.amount), notes: a.notes || undefined,
      })),
      approver_1_id: approver1.id, approver_2_id: approver2.id,
      auto_approve_first_step: isSelfApprover1,
    } as any)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {suggestions.length > 0 && (
        <div className="bg-sigvaris-blue-pale rounded-lg p-3">
          <p className="text-xs font-semibold text-sigvaris-blue mb-2">💡 Suggested budget lines</p>
          <div className="flex flex-wrap gap-2">
            {(suggestions as InvoiceSuggestion[]).map(s => (
              <button key={s.budget_line_id} type="button"
                onClick={() => { setValue('allocations.0.type', 'budget_line'); setValue('allocations.0.target_id', s.budget_line_id) }}
                className="text-xs px-3 py-1.5 bg-white border border-sigvaris-blue/20 rounded-full text-sigvaris-blue hover:bg-sigvaris-blue hover:text-white transition-colors">
                {s.budget_line_code} – {s.budget_line_name} <span className="opacity-60">{Math.round(s.confidence * 100)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Amount *</label>
          <div className="flex gap-2">
            <select className="input w-24 shrink-0" value={currency} onChange={e => setCurrency(e.target.value)}>
              {activeCurrencies.map((c: any) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
            <input type="number" step="0.01" className="input flex-1" required {...register('amount')} />
          </div>
          {currency !== 'CHF' && <p className="text-xs text-gray-400 mt-1">Converted to CHF automatically.</p>}
        </div>
        <div>
          <label className="label">Invoice Date *</label>
          <input type="date" className="input" required {...register('invoice_date')} />
          {dateWarning && <p className="text-amber-600 text-xs mt-1">⚠️ {dateWarning}</p>}
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea className="input" rows={2} {...register('notes')} />
      </div>

      {/* Budget year selector */}
      <div>
        <label className="label">Budget Year *</label>
        {availableYears.length > 0 ? (
          <select className="input" value={effectiveYear}
            onChange={e => setBudgetYear(e.target.value)}>
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        ) : (
          <div className="input bg-gray-50 text-gray-400 text-sm">
            No budget uploaded for this cost center yet
          </div>
        )}
        <p className="text-xs text-gray-400 mt-1">Budget lines below are filtered to the selected year.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Budget Allocations *</label>
          <button type="button" onClick={() => append({ type: 'budget_line', target_id: '', amount: '', notes: '' })}
            className="text-xs text-sigvaris-blue hover:underline">+ Add line</button>
        </div>
        <div className="space-y-2">
          {fields.map((field, i) => (
            <div key={field.id} className="grid grid-cols-12 gap-2 items-end p-3 bg-gray-50 rounded-lg">
              <div className="col-span-2">
                <label className="label text-xs">Type</label>
                <select className="input text-xs py-1.5" {...register(`allocations.${i}.type`)}>
                  <option value="budget_line">Budget Line</option>
                  <option value="project">Project</option>
                </select>
              </div>
              <div className="col-span-5">
                <label className="label text-xs">{watch(`allocations.${i}.type`) === 'budget_line' ? 'Budget Line' : 'Project'}</label>
                <select className="input text-xs py-1.5" required {...register(`allocations.${i}.target_id`)}>
                  <option value="">Select…</option>
                  {watch(`allocations.${i}.type`) === 'budget_line'
                    ? budgetLines.map(bl => <option key={bl.id} value={bl.id}>{bl.code} – {bl.name}</option>)
                    : projects.map(p => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label text-xs">Amount</label>
                <input type="number" step="0.01" className="input text-xs py-1.5" required {...register(`allocations.${i}.amount`)} />
              </div>
              <div className="col-span-2">
                <label className="label text-xs">Notes</label>
                <input type="text" className="input text-xs py-1.5" {...register(`allocations.${i}.notes`)} />
              </div>
              <div className="col-span-1 pb-0.5">
                {fields.length > 1 && <button type="button" onClick={() => remove(i)} className="w-full py-1.5 text-red-400 hover:text-red-600 text-sm">×</button>}
              </div>
            </div>
          ))}
        </div>
        {multiLine && invoiceTotal > 0 && (
          <div className={`mt-2 p-3 rounded-lg text-sm flex items-center justify-between ${Math.abs(remaining) < 0.01 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
            <span>Allocated: <strong>{CHF(totalAllocated)}</strong> of <strong>{CHF(invoiceTotal)}</strong></span>
            <span className="font-semibold">{Math.abs(remaining) < 0.01 ? '✓ Balanced' : remaining > 0 ? `${CHF(remaining)} remaining` : `${CHF(Math.abs(remaining))} over`}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <UserSearch label="Approver 1 *" value={approver1} onChange={setApprover1} />
        <UserSearch label="Approver 2 *" value={approver2} onChange={setApprover2} />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" disabled={assignMut.isPending} className="btn-primary w-full justify-center">
        {assignMut.isPending
          ? 'Saving…'
          : currentUser?.id === approver1?.id
            ? 'Save and Approve'
            : 'Save'}
      </button>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc       = useQueryClient()

  const [tab, setTab]                     = useState<'detail' | 'audit'>('detail')
  const [rejectComment, setRejectComment] = useState('')
  const [showReject, setShowReject]       = useState(false)
  const [pdfBlobUrl, setPdfBlobUrl]       = useState<string | null>(null)
  const [pdfError, setPdfError]           = useState(false)
  const blobRef = useRef<string | null>(null)

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => getInvoice(id!),
    enabled: !!id,
  })

  // Auto-load PDF as authenticated blob URL
  useEffect(() => {
    if (!invoice?.pdf_path || !id) return
    let cancelled = false
    setPdfBlobUrl(null)
    setPdfError(false)
    getInvoicePdfBlob(id)
      .then(url => {
        if (cancelled) { URL.revokeObjectURL(url); return }
        if (blobRef.current) URL.revokeObjectURL(blobRef.current)
        blobRef.current = url
        setPdfBlobUrl(url)
      })
      .catch(() => { if (!cancelled) setPdfError(true) })
    return () => { cancelled = true }
  }, [invoice?.pdf_path, id])

  // Clean up blob URL on unmount
  useEffect(() => () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current) }, [])

  const { data: auditLog = [] } = useQuery({
    queryKey: ['invoice-audit', id],
    queryFn: () => getInvoiceAuditLog(id!),
    enabled: tab === 'audit' && !!id,
  })

  const approveMut = useMutation({
    mutationFn: () => approveInvoice(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoice', id] }),
  })
  const rejectMut = useMutation({
    mutationFn: () => rejectInvoice(id!, rejectComment),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoice', id] }); setShowReject(false) },
  })

  if (isLoading) return <div className="p-8 text-gray-400">Loading…</div>
  if (!invoice)  return <div className="p-8 text-gray-400">Invoice not found</div>

  const myPendingStep   = invoice.approval_steps.find(s => s.approver.id === user?.id && s.status === 'pending')
  const priorStepPending = myPendingStep
    ? invoice.approval_steps.some(s => s.step_order < myPendingStep.step_order && s.status === 'pending')
    : false
  const canApprove    = !!myPendingStep && invoice.status === 'pending_approval'
  const canAssign     = invoice.status === 'pending_assignment'

  const statusColors: Record<string, string> = {
    pending_assignment: 'bg-blue-50 text-blue-700 border-blue-200',
    pending_approval:   'bg-yellow-50 text-yellow-700 border-yellow-200',
    approved:           'bg-green-50 text-green-700 border-green-200',
    rejected:           'bg-red-50 text-red-700 border-red-200',
  }
  const statusLabel: Record<string, string> = {
    pending_assignment: 'New',
    pending_approval:   'Pending Approval',
    approved:           'Approved',
    rejected:           'Rejected',
  }

  const stepColor = (s: ApprovalStep) =>
    s.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
    s.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
    s.approver.id === user?.id ? 'bg-yellow-50 text-yellow-700 border-yellow-300 font-semibold' :
    'bg-gray-50 text-gray-500 border-gray-200'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-5">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-700 text-sm">← Back</button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{invoice.vendor.name}</h1>
            {invoice.cost_center && (
              <span className="text-xs bg-sigvaris-blue-pale text-sigvaris-blue px-2 py-0.5 rounded font-mono font-medium">
                {invoice.cost_center.code} — {invoice.cost_center.name}
              </span>
            )}
          </div>
          {invoice.invoice_number && <p className="text-gray-400 text-sm mt-0.5">{invoice.invoice_number}</p>}
        </div>
        <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${statusColors[invoice.status]}`}>
          {statusLabel[invoice.status] ?? invoice.status}
        </span>
      </div>

      {/* Main grid: 3 left + 2 right */}
      <div className="grid grid-cols-5 gap-5">

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="col-span-3 space-y-4">

          {/* Invoice info */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Invoice Details</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div><dt className="text-gray-400">Vendor</dt><dd className="font-medium">{invoice.vendor.name}</dd></div>
              <div><dt className="text-gray-400">Uploaded by</dt><dd className="font-medium">{invoice.uploaded_by.display_name}</dd></div>
              <div><dt className="text-gray-400">Upload date</dt><dd className="font-medium">{format(new Date(invoice.created_at), 'dd MMM yyyy')}</dd></div>
              <div>
                <dt className="text-gray-400">Amount</dt>
                <dd className="font-medium">
                  {invoice.amount
                    ? Number(invoice.amount).toLocaleString('de-CH', { style: 'currency', currency: 'CHF' })
                    : <span className="text-gray-300 font-normal">Not set</span>}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Invoice Date</dt>
                <dd className="font-medium">
                  {invoice.due_date ? format(new Date(invoice.due_date), 'dd MMM yyyy') : <span className="text-gray-300 font-normal">Not set</span>}
                </dd>
              </div>
              {invoice.notes && <div className="col-span-2"><dt className="text-gray-400">Notes</dt><dd className="font-medium">{invoice.notes}</dd></div>}
            </dl>
          </div>

          {/* Budget allocations */}
          {invoice.allocations.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">Budget Allocations</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs border-b border-gray-100">
                    <th className="pb-2 font-medium">Line / Project</th>
                    <th className="pb-2 font-medium text-right">Amount</th>
                    <th className="pb-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {invoice.allocations.map(a => (
                    <tr key={a.id}>
                      <td className="py-2">
                        {a.budget_line
                          ? <><span className="font-mono text-xs text-gray-400">{a.budget_line.code}</span> {a.budget_line.name}</>
                          : <span className="text-purple-700">📁 {a.project?.name}</span>}
                      </td>
                      <td className="py-2 text-right font-medium">{Number(a.amount).toLocaleString('de-CH', { style: 'currency', currency: 'CHF' })}</td>
                      <td className="py-2 text-gray-400">{a.notes || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Process form */}
          {canAssign && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">Process Invoice</h2>
              <AssignmentForm invoiceId={invoice.id} costCenterId={invoice.cost_center_id} onDone={() => {}} />
            </div>
          )}

          {/* Approval flow / Audit log */}
          <div className="card">
            <div className="flex gap-4 mb-4 border-b border-gray-100 -mx-6 px-6">
              {(['detail', 'audit'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-sigvaris-blue text-sigvaris-blue' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                  {t === 'detail' ? 'Approval Flow' : 'Audit Log'}
                </button>
              ))}
            </div>
            {tab === 'detail' ? (
              invoice.approval_steps.length > 0
                ? (
                  <div className="space-y-3">
                    {invoice.approval_steps.map((step, i) => (
                      <div key={step.id} className="flex items-start gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          step.status === 'approved' ? 'bg-green-100 text-green-700' :
                          step.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                          {step.status === 'approved' ? '✓' : step.status === 'rejected' ? '✗' : i + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{step.approver.display_name}</p>
                          <p className="text-xs text-gray-400 capitalize">{step.status}</p>
                          {step.comment && <p className="text-xs text-gray-600 italic mt-0.5">"{step.comment}"</p>}
                          {step.decided_at && <p className="text-xs text-gray-400">{format(new Date(step.decided_at), 'dd MMM yyyy')}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )
                : <p className="text-gray-400 text-sm">No approval steps yet</p>
            ) : (
              <div className="space-y-3 text-sm">
                {auditLog.map(e => (
                  <div key={e.id} className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-sigvaris-blue mt-2 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-900">{e.action.replace(/_/g, ' ')}</p>
                      <p className="text-gray-400 text-xs">{e.user} · {format(new Date(e.created_at), 'dd MMM yyyy HH:mm')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────────────────── */}
        <div className="col-span-2 space-y-4">

          {/* Compact approval card */}
          <div className="card">
            {/* Horizontal step pills */}
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              {invoice.approval_steps.length === 0
                ? <p className="text-xs text-gray-400">Approvers set when owner processes invoice</p>
                : invoice.approval_steps.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-gray-300 text-xs">→</span>}
                      <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border ${stepColor(s)}`}>
                        <span>{s.status === 'approved' ? '✓' : s.status === 'rejected' ? '✗' : i + 1}</span>
                        <span>{s.approver.display_name.split(' ')[0]}</span>
                      </div>
                    </div>
                  ))
              }
            </div>
            {invoice.approval_steps.some(s => s.comment) && (
              <div className="space-y-1 mb-3">
                {invoice.approval_steps.filter(s => s.comment).map(s => (
                  <p key={s.id} className="text-xs text-gray-500 italic">
                    {s.approver.display_name.split(' ')[0]}: "{s.comment}"
                  </p>
                ))}
              </div>
            )}

            {/* Approve / Reject */}
            {canApprove && (
              <div className="pt-3 border-t border-gray-100 space-y-2">
                {priorStepPending ? (
                  <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                    ⏳ Waiting for step {myPendingStep!.step_order - 1} approval before you can act.
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Your turn — step {myPendingStep!.step_order}</p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => approveMut.mutate()}
                    disabled={approveMut.isPending || priorStepPending}
                    className="btn-primary flex-1 justify-center text-sm py-2 disabled:opacity-40 disabled:cursor-not-allowed">
                    ✓ Approve
                  </button>
                  <button onClick={() => setShowReject(s => !s)}
                    disabled={priorStepPending}
                    className="btn-danger flex-1 justify-center text-sm py-2 disabled:opacity-40 disabled:cursor-not-allowed">
                    ✗ Reject
                  </button>
                </div>
                {!priorStepPending && showReject && (
                  <div>
                    <textarea className="input text-sm" rows={2} value={rejectComment}
                      onChange={e => setRejectComment(e.target.value)} placeholder="Rejection reason…" />
                    <button onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending}
                      className="btn-danger w-full justify-center mt-2 text-sm">Confirm Rejection</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PDF viewer — auto-loaded */}
          <div className="card p-0 overflow-hidden flex flex-col" style={{ height: '70vh' }}>
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 shrink-0 flex items-center justify-between">
              <p className="text-xs font-medium text-gray-600 truncate">
                {invoice.original_filename ?? 'Invoice PDF'}
              </p>
              {pdfBlobUrl && (
                <a href={pdfBlobUrl} download={invoice.original_filename ?? 'invoice.pdf'}
                  className="text-xs text-sigvaris-blue hover:underline shrink-0 ml-2">
                  ↓ Download
                </a>
              )}
            </div>

            {pdfBlobUrl ? (
              <iframe
                src={pdfBlobUrl}
                className="flex-1 w-full border-0"
                title="Invoice PDF"
              />
            ) : pdfError ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm text-center p-4">
                <div>
                  <p className="text-2xl mb-2">⚠️</p>
                  <p>Could not load PDF</p>
                </div>
              </div>
            ) : invoice.pdf_path ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                <div className="w-6 h-6 border-2 border-sigvaris-blue border-t-transparent rounded-full animate-spin mr-2" />
                Loading PDF…
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
                No PDF attached
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
