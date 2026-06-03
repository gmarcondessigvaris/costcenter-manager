import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { format } from 'date-fns'
import {
  getInvoice, listBudgetLines, listProjects, searchUsers,
  assignInvoice, approveInvoice, rejectInvoice,
  getInvoiceSuggestions, getInvoiceAuditLog, getInvoicePdfUrl,
  listCurrencies,
} from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import type { ApprovalStep, InvoiceSuggestion, User } from '../types'

// ── Approval timeline ─────────────────────────────────────────────────────────

function ApprovalTimeline({ steps }: { steps: ApprovalStep[] }) {
  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-start gap-3">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
            step.status === 'approved' ? 'bg-green-100 text-green-700' :
            step.status === 'rejected' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-500'
          }`}>
            {step.status === 'approved' ? '✓' : step.status === 'rejected' ? '✗' : i + 1}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{step.approver.display_name}</p>
            <p className="text-xs text-gray-400 capitalize">{step.status}</p>
            {step.comment && <p className="text-xs text-gray-600 italic mt-0.5">"{step.comment}"</p>}
            {step.decided_at && (
              <p className="text-xs text-gray-400">{format(new Date(step.decided_at), 'dd MMM yyyy')}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── User search input ─────────────────────────────────────────────────────────

function UserSearch({ label, value, onChange }: { label: string; value: User | null; onChange: (u: User) => void }) {
  const [q, setQ] = useState('')
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
          <div className="w-6 h-6 rounded-full bg-sigvaris-blue text-white text-xs flex items-center justify-center font-bold">
            {value.display_name[0]}
          </div>
          <span className="text-sm flex-1">{value.display_name}</span>
          <button type="button" onClick={() => { onChange(null as any); setQ('') }} className="text-gray-400 hover:text-gray-600 text-xs">×</button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            className="input"
            placeholder="Search by name or email…"
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
          />
          {open && results.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {results.map(u => (
                <li
                  key={u.id}
                  className="px-3 py-2 text-sm hover:bg-sigvaris-blue-pale cursor-pointer"
                  onMouseDown={() => { onChange(u); setQ(''); setOpen(false) }}
                >
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

interface AllocationRow {
  type: 'budget_line' | 'project'
  target_id: string
  amount: string
  notes: string
}

interface AssignForm {
  amount: string
  due_date: string
  notes: string
  allocations: AllocationRow[]
}

function AssignmentForm({ invoiceId, costCenterId, onDone }: {
  invoiceId: string
  costCenterId: string
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [approver1, setApprover1] = useState<User | null>(null)
  const [approver2, setApprover2] = useState<User | null>(null)
  const [error, setError] = useState('')
  const [currency, setCurrency] = useState('CHF')
  const [rateMode, setRateMode] = useState<'auto' | 'manual'>('auto')
  const [manualRate, setManualRate] = useState('')

  const { data: budgetLines = [] } = useQuery({
    queryKey: ['budget-lines', costCenterId],
    queryFn: () => listBudgetLines(costCenterId),
  })
  const { data: projects = [] } = useQuery({
    queryKey: ['projects', costCenterId],
    queryFn: () => listProjects(costCenterId),
  })
  const { data: currencies = [] } = useQuery({
    queryKey: ['currencies'],
    queryFn: listCurrencies,
  })
  const activeCurrencies = currencies.filter((c: any) => c.is_active)
  const selectedCurrency = activeCurrencies.find((c: any) => c.code === currency)
  const displayRate = rateMode === 'manual' ? parseFloat(manualRate) || 0 : Number(selectedCurrency?.rate_to_chf ?? 1)
  const { data: suggestions = [] } = useQuery({
    queryKey: ['suggestions', invoiceId],
    queryFn: () => getInvoiceSuggestions(invoiceId),
  })

  const { register, control, handleSubmit, watch, setValue } = useForm<AssignForm>({
    defaultValues: { amount: '', due_date: '', notes: '', allocations: [{ type: 'budget_line', target_id: '', amount: '', notes: '' }] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'allocations' })

  const assignMut = useMutation({
    mutationFn: (data: Parameters<typeof assignInvoice>[1]) => assignInvoice(invoiceId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoice', invoiceId] }); onDone() },
    onError: (e: any) => setError(e.response?.data?.detail || 'Failed to assign invoice'),
  })

  function applySuggestion(s: InvoiceSuggestion) {
    setValue('allocations.0.type', 'budget_line')
    setValue('allocations.0.target_id', s.budget_line_id)
  }

  function onSubmit(form: AssignForm) {
    setError('')
    if (!approver1 || !approver2) return setError('Please select both approvers')
    if (approver1.id === approver2.id) return setError('Approvers must be different people')

    const allocations = form.allocations.map(a => ({
      budget_line_id: a.type === 'budget_line' ? a.target_id : undefined,
      project_id: a.type === 'project' ? a.target_id : undefined,
      amount: parseFloat(a.amount),
      notes: a.notes || undefined,
    }))

    assignMut.mutate({
      amount: parseFloat(form.amount),
      due_date: form.due_date,
      notes: form.notes || undefined,
      currency,
      exchange_rate_mode: rateMode,
      exchange_rate: rateMode === 'manual' ? parseFloat(manualRate) : undefined,
      allocations,
      approver_1_id: approver1.id,
      approver_2_id: approver2.id,
    } as any)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {suggestions.length > 0 && (
        <div className="bg-sigvaris-blue-pale rounded-lg p-3">
          <p className="text-xs font-semibold text-sigvaris-blue mb-2">💡 Suggested budget lines based on past invoices</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map(s => (
              <button
                key={s.budget_line_id}
                type="button"
                onClick={() => applySuggestion(s)}
                className="text-xs px-3 py-1.5 bg-white border border-sigvaris-blue/20 rounded-full text-sigvaris-blue hover:bg-sigvaris-blue hover:text-white transition-colors"
              >
                {s.budget_line_code} – {s.budget_line_name}
                <span className="ml-1 opacity-60">{Math.round(s.confidence * 100)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Currency */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Currency & Exchange Rate</p>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
            {(['auto','manual'] as const).map(m => (
              <button key={m} type="button" onClick={() => setRateMode(m)}
                className={`px-3 py-1.5 font-medium transition-colors capitalize ${
                  rateMode === m ? 'bg-sigvaris-blue text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}>
                {m === 'auto' ? '⚡ Auto rate' : '✏️ Manual rate'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label text-xs">Currency *</label>
            <select className="input text-sm" value={currency} onChange={e => setCurrency(e.target.value)}>
              {activeCurrencies.map((c: any) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">
              {rateMode === 'auto' ? 'Current rate (1 '+currency+' =)' : 'Custom rate (1 '+currency+' =)'}
            </label>
            {rateMode === 'auto' ? (
              <div className="input bg-gray-100 text-gray-500 text-sm">
                {displayRate.toFixed(6)} CHF
              </div>
            ) : (
              <input type="number" step="0.000001" className="input text-sm"
                placeholder="e.g. 1.05" value={manualRate} onChange={e => setManualRate(e.target.value)} />
            )}
          </div>
          <div>
            <label className="label text-xs">Amount in CHF (preview)</label>
            <div className="input bg-gray-100 text-gray-500 text-sm font-mono">
              {/* Shown once amount is entered */}
              {displayRate > 0 ? `≈ CHF ${(displayRate).toFixed(4)} × amount` : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Amount ({currency}) *</label>
          <input type="number" step="0.01" className="input" required {...register('amount')} />
        </div>
        <div>
          <label className="label">Due Date *</label>
          <input type="date" className="input" required {...register('due_date')} />
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea className="input" rows={2} {...register('notes')} />
      </div>

      {/* Allocations */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Budget Allocations *</label>
          <button
            type="button"
            onClick={() => append({ type: 'budget_line', target_id: '', amount: '', notes: '' })}
            className="text-xs text-sigvaris-blue hover:underline"
          >
            + Add line
          </button>
        </div>
        <div className="space-y-3">
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
                <label className="label text-xs">
                  {watch(`allocations.${i}.type`) === 'budget_line' ? 'Budget Line' : 'Project'}
                </label>
                <select className="input text-xs py-1.5" required {...register(`allocations.${i}.target_id`)}>
                  <option value="">Select…</option>
                  {watch(`allocations.${i}.type`) === 'budget_line'
                    ? budgetLines.map(bl => <option key={bl.id} value={bl.id}>{bl.code} – {bl.name}</option>)
                    : projects.map(p => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)
                  }
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
                {fields.length > 1 && (
                  <button type="button" onClick={() => remove(i)} className="w-full py-1.5 text-red-400 hover:text-red-600 text-sm">×</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Approvers */}
      <div className="grid grid-cols-2 gap-4">
        <UserSearch label="Approver 1 *" value={approver1} onChange={setApprover1} />
        <UserSearch label="Approver 2 *" value={approver2} onChange={setApprover2} />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button type="submit" disabled={assignMut.isPending} className="btn-primary w-full justify-center">
        {assignMut.isPending ? 'Submitting…' : 'Submit for Approval'}
      </button>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'detail' | 'audit'>('detail')
  const [rejectComment, setRejectComment] = useState('')
  const [showReject, setShowReject] = useState(false)

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => getInvoice(id!),
    enabled: !!id,
  })

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
  if (!invoice) return <div className="p-8 text-gray-400">Invoice not found</div>

  const myPendingStep = invoice.approval_steps.find(
    s => s.approver.id === user?.id && s.status === 'pending'
  )
  const canApprove = !!myPendingStep && invoice.status === 'pending_approval'
  const canAssign = invoice.status === 'pending_assignment'

  const statusColors: Record<string, string> = {
    pending_assignment: 'bg-blue-50 text-blue-700 border-blue-200',
    pending_approval: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    approved: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
  }

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-700 text-sm">← Back</button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{invoice.vendor.name}</h1>
          {invoice.invoice_number && <p className="text-gray-400 text-sm">{invoice.invoice_number}</p>}
        </div>
        <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border capitalize ${statusColors[invoice.status]}`}>
          {invoice.status.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: details */}
        <div className="col-span-2 space-y-4">
          {/* Invoice info */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Invoice Details</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-400">Vendor</dt>
                <dd className="font-medium">{invoice.vendor.name}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Uploaded by</dt>
                <dd className="font-medium">{invoice.uploaded_by.display_name}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Upload date</dt>
                <dd className="font-medium">{format(new Date(invoice.created_at), 'dd MMM yyyy')}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Amount</dt>
                <dd className="font-medium">
                  {invoice.amount
                    ? Number(invoice.amount).toLocaleString('de-CH', { style: 'currency', currency: 'CHF' })
                    : <span className="text-gray-300 font-normal">Not set</span>}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Due Date</dt>
                <dd className="font-medium">
                  {invoice.due_date ? format(new Date(invoice.due_date), 'dd MMM yyyy') : <span className="text-gray-300 font-normal">Not set</span>}
                </dd>
              </div>
              {invoice.notes && (
                <div className="col-span-2">
                  <dt className="text-gray-400">Notes</dt>
                  <dd className="font-medium">{invoice.notes}</dd>
                </div>
              )}
            </dl>
            {invoice.pdf_path && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <a
                  href={getInvoicePdfUrl(invoice.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-xs"
                >
                  📄 View PDF — {invoice.original_filename}
                </a>
              </div>
            )}
          </div>

          {/* Allocations */}
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
                      <td className="py-2 text-right font-medium">
                        {Number(a.amount).toLocaleString('de-CH', { style: 'currency', currency: 'CHF' })}
                      </td>
                      <td className="py-2 text-gray-400">{a.notes || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Assignment form */}
          {canAssign && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">Assign Invoice</h2>
              <AssignmentForm
                invoiceId={invoice.id}
                costCenterId={invoice.cost_center_id}
                onDone={() => {}}
              />
            </div>
          )}

          {/* Audit log tab */}
          <div className="card">
            <div className="flex gap-4 mb-4 border-b border-gray-100 -mx-6 px-6">
              {(['detail', 'audit'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`pb-3 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                    tab === t ? 'border-sigvaris-blue text-sigvaris-blue' : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {t === 'detail' ? 'Approval Flow' : 'Audit Log'}
                </button>
              ))}
            </div>

            {tab === 'detail' ? (
              invoice.approval_steps.length > 0
                ? <ApprovalTimeline steps={invoice.approval_steps} />
                : <p className="text-gray-400 text-sm">No approval steps yet</p>
            ) : (
              <div className="space-y-3 text-sm">
                {auditLog.map(e => (
                  <div key={e.id} className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-sigvaris-blue mt-2 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-900">{e.action.replace(/_/g, ' ')}</p>
                      <p className="text-gray-400 text-xs">{e.user} · {format(new Date(e.created_at), 'dd MMM yyyy HH:mm')}</p>
                      {e.details && Object.keys(e.details).length > 0 && (
                        <pre className="text-xs bg-gray-50 rounded p-2 mt-1 text-gray-600 overflow-x-auto">
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="space-y-4">
          {canApprove && (
            <div className="card border-2 border-yellow-200">
              <h3 className="font-semibold text-gray-900 mb-1">Your Approval Required</h3>
              <p className="text-gray-400 text-xs mb-4">Step {myPendingStep!.step_order} of {invoice.approval_steps.length}</p>
              <div className="space-y-2">
                <button
                  onClick={() => approveMut.mutate()}
                  disabled={approveMut.isPending}
                  className="btn-primary w-full justify-center"
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => setShowReject(true)}
                  className="btn-danger w-full justify-center"
                >
                  ✗ Reject
                </button>
              </div>

              {showReject && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <label className="label text-xs">Rejection reason</label>
                  <textarea
                    className="input text-sm"
                    rows={2}
                    value={rejectComment}
                    onChange={e => setRejectComment(e.target.value)}
                    placeholder="Optional comment…"
                  />
                  <button
                    onClick={() => rejectMut.mutate()}
                    disabled={rejectMut.isPending}
                    className="btn-danger w-full justify-center mt-2"
                  >
                    Confirm Rejection
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">Approval Steps</h3>
            <ApprovalTimeline steps={invoice.approval_steps} />
            {invoice.approval_steps.length === 0 && (
              <p className="text-gray-400 text-xs">Assigned after owner sets approvers</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
