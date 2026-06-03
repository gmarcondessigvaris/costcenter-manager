import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { listCostCenters, getCostCenterReport } from '../services/api'

const YEARS = ['2024', '2025', '2026', '2027']
const CHF   = (n: number) => n.toLocaleString('de-CH', { style: 'currency', currency: 'CHF' })
type GroupBy = 'line' | 'account' | 'itr'

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    approved:           { cls: 'badge-approved',    label: 'Approved' },
    pending_approval:   { cls: 'badge-pending',     label: 'Pending' },
    rejected:           { cls: 'badge-rejected',    label: 'Rejected' },
    pending_assignment: { cls: 'badge-assignment',  label: 'Unassigned' },
  }
  const c = cfg[status] ?? { cls: 'badge-pending', label: status }
  return <span className={c.cls}>{c.label}</span>
}

function SpendBar({ pct }: { pct: number }) {
  return (
    <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1 ml-auto">
      <div
        className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-400' : 'bg-green-400'}`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  )
}

// ── Shared invoice sub-rows ────────────────────────────────────────────────────
function InvoiceSubRows({ invoices }: { invoices: any[] }) {
  return (
    <>
      {invoices.map((inv: any) => (
        <tr key={inv.allocation_id} className="bg-sigvaris-blue-pale/20 border-l-4 border-sigvaris-blue">
          <td className="pl-10 pr-4 py-2 text-xs text-gray-400 italic">{inv.invoice_number || '—'}</td>
          <td className="px-4 py-2 text-xs">
            <Link to={`/invoices/${inv.invoice_id}`} className="text-sigvaris-blue hover:underline font-medium">
              {inv.vendor_name}
            </Link>
            {inv.due_date && (
              <span className="text-gray-400 ml-2">due {format(new Date(inv.due_date), 'dd MMM yyyy')}</span>
            )}
          </td>
          <td className="px-4 py-2 text-right text-xs text-gray-400">
            {inv.currency && inv.currency !== 'CHF'
              ? <span title={`${inv.currency} ${inv.invoice_amount?.toLocaleString()}`}>{CHF(inv.invoice_amount_chf ?? inv.invoice_amount)}</span>
              : CHF(inv.invoice_amount)}
            {inv.currency && inv.currency !== 'CHF' && (
              <span className="block text-gray-300">{inv.currency} {Number(inv.invoice_amount).toLocaleString()}</span>
            )}
          </td>
          <td className="px-4 py-2 text-right text-xs font-medium text-gray-700">
            {CHF(inv.allocated_amount_chf ?? inv.allocated_amount)}
          </td>
          <td className="px-4 py-2" />
          <td className="px-4 py-2 text-center"><StatusBadge status={inv.status} /></td>
        </tr>
      ))}
    </>
  )
}

// ── Generic group row (used for all three views) ───────────────────────────────
function GroupRow({ label, sublabel, budget, spent, invoices }: {
  label: string; sublabel?: string; budget: number; spent: number; invoices: any[]
}) {
  const [open, setOpen] = useState(false)
  const remaining = budget - spent
  const pct       = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0

  return (
    <>
      <tr
        className={`hover:bg-gray-50 cursor-pointer ${open ? 'bg-sigvaris-blue-pale/30' : ''}`}
        onClick={() => invoices.length > 0 && setOpen(o => !o)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {invoices.length > 0 && (
              <span className="text-gray-400 text-xs w-3">{open ? '▼' : '▶'}</span>
            )}
            <span className="font-mono text-xs text-sigvaris-blue bg-sigvaris-blue-pale px-1.5 py-0.5 rounded">
              {label}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-700">{sublabel}</td>
        <td className="px-4 py-3 text-right text-xs text-gray-600">{CHF(budget)}</td>
        <td className="px-4 py-3 text-right text-xs">
          <span className={spent > budget ? 'text-red-600 font-semibold' : 'text-gray-700'}>{CHF(spent)}</span>
          <SpendBar pct={pct} />
        </td>
        <td className={`px-4 py-3 text-right text-xs font-semibold ${remaining < 0 ? 'text-red-600' : 'text-gray-900'}`}>
          {CHF(remaining)}
        </td>
        <td className="px-4 py-3 text-center text-xs">
          {invoices.length > 0 && (
            <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{invoices.length}</span>
          )}
        </td>
      </tr>
      {open && <InvoiceSubRows invoices={invoices} />}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportPage() {
  const [selectedCc,  setSelectedCc]  = useState('')
  const [fiscalYear,  setFiscalYear]  = useState(new Date().getFullYear().toString())
  const [groupBy,     setGroupBy]     = useState<GroupBy>('line')

  const { data: costCenters = [] } = useQuery({ queryKey: ['cost-centers'], queryFn: listCostCenters })
  const activeCc = selectedCc || costCenters[0]?.id || ''

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', activeCc, fiscalYear],
    queryFn:  () => getCostCenterReport(activeCc, fiscalYear),
    enabled:  !!activeCc,
  })

  // ── Grouped datasets ────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    if (!report) return []
    const lines: any[] = report.budget_lines

    if (groupBy === 'line') return lines.map(l => ({
      label:    l.account_code || l.raw_code,
      sublabel: l.description || l.account_description,
      budget:   l.budget_value,
      spent:    l.spent,
      invoices: l.invoices,
    }))

    // Group by account or ITR code
    const key   = groupBy === 'account' ? 'account_code' : 'itr_code'
    const desc  = groupBy === 'account' ? 'account_description' : 'itr_description'
    const map   = new Map<string, { sublabel: string; budget: number; spent: number; invoices: any[] }>()

    for (const line of lines) {
      const k = (line[key] || (groupBy === 'account' ? line.raw_code : 'No ITR')) as string
      const d = (line[desc] || line.description || '') as string
      if (!map.has(k)) map.set(k, { sublabel: d, budget: 0, spent: 0, invoices: [] })
      const entry = map.get(k)!
      entry.budget   += line.budget_value
      entry.spent    += line.spent
      entry.invoices.push(...line.invoices)
    }

    return [...map.entries()].map(([label, v]) => ({ label, ...v }))
  }, [report, groupBy])

  const summaryCards = report ? [
    { label: 'Total Budget', value: CHF(report.summary.total_budget),    color: 'text-sigvaris-blue' },
    { label: 'Spent',        value: CHF(report.summary.total_spent),     color: 'text-gray-900' },
    { label: 'Remaining',    value: CHF(report.summary.total_remaining), color: report.summary.total_remaining < 0 ? 'text-red-600' : 'text-green-600' },
    { label: 'Budget Used',  value: `${report.summary.pct_used}%`,       color: report.summary.pct_used >= 100 ? 'text-red-600' : report.summary.pct_used >= 80 ? 'text-yellow-600' : 'text-green-600' },
  ] : []

  const groupBtns: { key: GroupBy; label: string }[] = [
    { key: 'line',    label: 'Budget Line' },
    { key: 'account', label: 'Account' },
    { key: 'itr',     label: 'ITR Code' },
  ]

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
        <div>
          <label className="label">Group By</label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {groupBtns.map(b => (
              <button
                key={b.key}
                onClick={() => setGroupBy(b.key)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  groupBy === b.key
                    ? 'bg-sigvaris-blue text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && <p className="text-gray-400">Loading…</p>}

      {report && (
        <>
          {/* Summary cards */}
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

          {/* Main table */}
          <div className="card p-0 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {groupBy === 'line' ? 'Budget Lines' : groupBy === 'account' ? 'By Account' : 'By ITR Code'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Click a row to expand invoice allocations</p>
              </div>
              <span className="text-xs text-gray-400">{grouped.length} rows</span>
            </div>

            {grouped.length === 0 ? (
              <div className="p-12 text-center text-gray-400">No data for this cost center and year</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      {groupBy === 'itr' ? 'ITR Code' : 'Account'}
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Description</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Budget</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Spent</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Remaining</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">Invoices</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {grouped.map((row, i) => (
                    <GroupRow key={`${row.label}-${i}`} {...row} />
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
