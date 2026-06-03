import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  listCostCenters, listBudgetUploads, listBudgetLines,
  listInvoices, uploadBudget,
} from '../services/api'
import { useAuth } from '../contexts/AuthContext'

export default function BudgetsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isFinance = user?.role === 'finance' || user?.role === 'admin'

  const [selectedCc, setSelectedCc] = useState('')
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear().toString())
  const [uploadYear, setUploadYear] = useState(new Date().getFullYear().toString())
  const [file, setFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState('')

  const { data: costCenters = [] } = useQuery({ queryKey: ['cost-centers'], queryFn: listCostCenters })

  const activeCc = selectedCc || costCenters[0]?.id || ''

  const { data: budgetLines = [] } = useQuery({
    queryKey: ['budget-lines', activeCc, fiscalYear],
    queryFn: () => listBudgetLines(activeCc, fiscalYear),
    enabled: !!activeCc,
  })

  const { data: uploads = [] } = useQuery({
    queryKey: ['budget-uploads', activeCc],
    queryFn: () => listBudgetUploads(activeCc),
    enabled: !!activeCc,
  })

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', null, activeCc],
    queryFn: () => listInvoices({ cost_center_id: activeCc }),
    enabled: !!activeCc,
  })

  const uploadMut = useMutation({
    mutationFn: () => uploadBudget(activeCc, uploadYear, file!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget-lines', activeCc] })
      qc.invalidateQueries({ queryKey: ['budget-uploads', activeCc] })
      setFile(null)
      setUploadError('')
    },
    onError: (e: any) => setUploadError(e.response?.data?.detail || 'Upload failed'),
  })

  // Calculate spending per budget line from approved + pending_approval invoices
  const spendingByLine = budgetLines.reduce<Record<string, number>>((acc, bl) => {
    acc[bl.id] = 0
    return acc
  }, {})

  invoices
    .filter(i => i.status === 'approved' || i.status === 'pending_approval')
    .forEach(inv => {
      inv.allocations.forEach(a => {
        if (a.budget_line && spendingByLine[a.budget_line.id] !== undefined) {
          spendingByLine[a.budget_line.id] += Number(a.amount)
        }
      })
    })

  const cc = costCenters.find(c => c.id === activeCc)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Budgets</h1>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className="label">Cost Center</label>
          <select className="input" value={activeCc} onChange={e => setSelectedCc(e.target.value)}>
            {costCenters.map(c => (
              <option key={c.id} value={c.id}>{c.code} – {c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Fiscal Year</label>
          <select className="input" value={fiscalYear} onChange={e => setFiscalYear(e.target.value)}>
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Budget lines table */}
        <div className="col-span-2">
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">
                Budget Lines — {cc?.code} {cc?.name} ({fiscalYear})
              </h2>
            </div>
            {budgetLines.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                No budget lines for this year. {isFinance && 'Upload an Excel file to create them.'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Code</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Name</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-500">Budget</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-500">Spent</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-500">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {budgetLines.map(bl => {
                    const spent = spendingByLine[bl.id] ?? 0
                    const budget = Number(bl.allocated_amount)
                    const remaining = budget - spent
                    const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0
                    return (
                      <tr key={bl.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-mono text-xs text-gray-400">{bl.code}</td>
                        <td className="px-6 py-3 text-gray-900">{bl.name}</td>
                        <td className="px-6 py-3 text-right text-gray-600">
                          {budget.toLocaleString('de-CH', { style: 'currency', currency: 'CHF' })}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <span className={spent > budget ? 'text-red-600 font-medium' : 'text-gray-600'}>
                            {spent.toLocaleString('de-CH', { style: 'currency', currency: 'CHF' })}
                          </span>
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1 ml-auto">
                            <div
                              className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-400' : 'bg-green-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                        <td className={`px-6 py-3 text-right font-medium ${remaining < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                          {remaining.toLocaleString('de-CH', { style: 'currency', currency: 'CHF' })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Upload form (finance only) */}
          {isFinance && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-4">Upload Budget File</h3>
              <div className="space-y-3">
                <div>
                  <label className="label">Fiscal Year</label>
                  <select className="input" value={uploadYear} onChange={e => setUploadYear(e.target.value)}>
                    {[2024, 2025, 2026, 2027].map(y => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Excel File (.xlsx)</label>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-sigvaris-blue-pale file:text-sigvaris-blue cursor-pointer"
                    onChange={e => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                {uploadError && <p className="text-red-600 text-xs">{uploadError}</p>}
                <button
                  onClick={() => uploadMut.mutate()}
                  disabled={!file || !activeCc || uploadMut.isPending}
                  className="btn-primary w-full justify-center text-sm"
                >
                  {uploadMut.isPending ? 'Uploading…' : 'Upload Budget'}
                </button>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
                Expected columns: A = Code, B = Name, C = Amount
              </div>
            </div>
          )}

          {/* Upload history */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">Upload History</h3>
            {uploads.length === 0 ? (
              <p className="text-gray-400 text-xs">No uploads yet</p>
            ) : (
              <div className="space-y-2">
                {uploads.map(u => (
                  <div key={u.id} className="flex items-start gap-2 text-xs">
                    <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${u.is_active ? 'bg-green-400' : 'bg-gray-300'}`} />
                    <div>
                      <p className="font-medium text-gray-900">{u.fiscal_year} — {u.original_filename}</p>
                      <p className="text-gray-400">
                        {u.uploaded_by.display_name} · {format(new Date(u.created_at), 'dd MMM yyyy')}
                      </p>
                      <p className="text-gray-400">{u.budget_lines.length} lines · {u.is_active ? 'Active' : 'Superseded'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
