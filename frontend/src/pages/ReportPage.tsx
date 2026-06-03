import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { listCostCenters, getCostCenterReport } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const YEARS = ['2024', '2025', '2026', '2027']
const CHF = (n: number) => n.toLocaleString('de-CH', { style: 'currency', currency: 'CHF' })

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    approved: 'badge-approved',
    pending_approval: 'badge-pending',
    rejected: 'badge-rejected',
    pending_assignment: 'badge-assignment',
  }
  const label: Record<string, string> = {
    approved: 'Approved',
    pending_approval: 'Pending',
    rejected: 'Rejected',
    pending_assignment: 'Unassigned',
  }
  return <span className={cls[status] ?? 'badge-pending'}>{label[status] ?? status}</span>
}

function BudgetLineRow({ line }: { line: any }) {
  const [open, setOpen] = useState(false)
  const pct = line.budget_value > 0 ? Math.min(100, (line.spent / line.budget_value) * 100) : 0
  const over = line.remaining < 0

  return (
    <>
      <tr
        className={`hover:bg-gray-50 cursor-pointer ${open ? 'bg-sigvaris-blue-pale/30' : ''}`}
        onClick={() => line.invoices.length > 0 && setOpen(o => !o)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {line.invoices.length > 0 && (
              <span className="text-gray-400 text-xs w-3">{open ? '▼' : '▶'}</span>
            )}
            <div>
              <span className="font-mono text-xs text-sigvaris-blue bg-sigvaris-blue-pale px-1.5 py-0.5 rounded">
                {line.account_code}
              </span>
              {line.itr_code && (
                <span className="ml-1 font-mono text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                  {line.itr_code}
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-700">{line.description || line.account_description}</td>
        <td className="px-4 py-3 text-right text-xs text-gray-600">{CHF(line.budget_value)}</td>
        <td className="px-4 py-3 text-right text-xs">
          <span className={over ? 'text-red-600 font-semibold' : 'text-gray-700'}>{CHF(line.spent)}</span>
          <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1 ml-auto">
            <div
              className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-400' : 'bg-green-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </td>
        <td className={`px-4 py-3 text-right text-xs font-semibold ${over ? 'text-red-600' : 'text-gray-900'}`}>
          {CHF(line.remaining)}
        </td>
        <td className="px-4 py-3 text-center text-xs text-gray-400">
          {line.invoices.length > 0 && (
            <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{line.invoices.length}</span>
          )}
        </td>
      </tr>

      {open && line.invoices.map((inv: any) => (
        <tr key={inv.allocation_id} className="bg-sigvaris-blue-pale/20 border-l-2 border-sigvaris-blue">
          <td className="pl-10 pr-4 py-2 text-xs text-gray-500 italic">
            {inv.invoice_number || '—'}
          </td>
          <td className="px-4 py-2 text-xs">
            <Link to={`/invoices/${inv.invoice_id}`} className="text-sigvaris-blue hover:underline font-medium">
              {inv.vendor_name}
            </Link>
            {inv.due_date && (
              <span className="text-gray-400 ml-2">
                due {format(new Date(inv.due_date), 'dd MMM yyyy')}
              </span>
            )}
          </td>
          <td className="px-4 py-2 text-right text-xs text-gray-400">{CHF(inv.invoice_amount)}</td>
          <td className="px-4 py-2 text-right text-xs font-medium text-gray-700">{CHF(inv.allocated_amount)}</td>
          <td className="px-4 py-2" />
          <td className="px-4 py-2 text-center"><StatusBadge status={inv.status} /></td>
        </tr>
      ))}
    </>
  )
}

export default function ReportPage() {
  const { user } = useAuth()
  const [selectedCc, setSelectedCc] = useState('')
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear().toString())

  const { data: costCenters = [] } = useQuery({ queryKey: ['cost-centers'], queryFn: listCostCenters })
  const activeCc = selectedCc || costCenters[0]?.id || ''

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', activeCc, fiscalYear],
    queryFn: () => getCostCenterReport(activeCc, fiscalYear),
    enabled: !!activeCc,
  })

  const summaryCards = report ? [
    { label: 'Total Budget',    value: CHF(report.summary.total_budget),    color: 'text-sigvaris-blue' },
    { label: 'Spent',           value: CHF(report.summary.total_spent),     color: 'text-gray-900' },
    { label: 'Remaining',       value: CHF(report.summary.total_remaining), color: report.summary.total_remaining < 0 ? 'text-red-600' : 'text-green-600' },
    { label: 'Budget Used',     value: `${report.summary.pct_used}%`,       color: report.summary.pct_used >= 100 ? 'text-red-600' : report.summary.pct_used >= 80 ? 'text-yellow-600' : 'text-green-600' },
  ] : []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cost Center Report</h1>
      </div>

      {/* Selectors */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className="label">Cost Center</label>
          <select className="input" value={activeCc} onChange={e => setSelectedCc(e.target.value)}>
            {costCenters.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Fiscal Year</label>
          <select className="input" value={fiscalYear} onChange={e => setFiscalYear(e.target.value)}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {isLoading && <p className="text-gray-400">Loading…</p>}

      {report && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {summaryCards.map(s => (
              <div key={s.label} className="card">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-sm text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="card mb-6 py-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>0%</span>
              <span className={report.summary.pct_used >= 100 ? 'text-red-600 font-semibold' : ''}>
                {report.summary.pct_used}% used
              </span>
              <span>100%</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full">
              <div
                className={`h-full rounded-full transition-all ${
                  report.summary.pct_used >= 100 ? 'bg-red-500' :
                  report.summary.pct_used >= 80  ? 'bg-yellow-400' : 'bg-green-400'
                }`}
                style={{ width: `${Math.min(100, report.summary.pct_used)}%` }}
              />
            </div>
          </div>

          {/* Budget lines table */}
          <div className="card p-0 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Budget Lines</h2>
              <p className="text-xs text-gray-400 mt-0.5">Click a row to expand invoice allocations</p>
            </div>
            {report.budget_lines.length === 0 ? (
              <div className="p-12 text-center text-gray-400">No budget lines for this year</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Account / ITR</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Description</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Budget</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Spent</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Remaining</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">Invoices</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {report.budget_lines.map((line: any) => (
                    <BudgetLineRow key={line.id} line={line} />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Project allocations */}
          {report.project_allocations.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Project Allocations</h2>
                <p className="text-xs text-gray-400 mt-0.5">Invoices allocated to projects instead of budget lines</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Project</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Vendor</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-500">Allocated</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {report.project_allocations.map((a: any) => (
                    <tr key={a.allocation_id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-xs">
                        <span className="font-mono text-purple-700">{a.project_code}</span>
                        <span className="text-gray-600 ml-2">{a.project_name}</span>
                      </td>
                      <td className="px-6 py-3 text-xs">
                        <Link to={`/invoices/${a.invoice_id}`} className="text-sigvaris-blue hover:underline">
                          {a.vendor_name}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-right text-xs font-medium">{CHF(a.allocated_amount)}</td>
                      <td className="px-6 py-3"><StatusBadge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
