import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { listInvoices, listCostCenters, listVendors, createVendor, uploadInvoice } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import type { InvoiceStatus } from '../types'

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending_assignment: 'New',
  pending_approval:   'Pending Approval',
  approved:           'Approved',
  rejected:           'Rejected',
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const cls = {
    pending_assignment: 'badge-assignment',
    pending_approval: 'badge-pending',
    approved: 'badge-approved',
    rejected: 'badge-rejected',
  }[status]
  return <span className={cls}>{STATUS_LABELS[status]}</span>
}

function UploadModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: costCenters = [] } = useQuery({ queryKey: ['cost-centers'], queryFn: listCostCenters })
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: listVendors })

  const [ccId, setCcId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [newVendor, setNewVendor] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  const createVendorMut = useMutation({
    mutationFn: (name: string) => createVendor(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  })

  const uploadMut = useMutation({
    mutationFn: uploadInvoice,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      onClose()
    },
    onError: (e: any) => setError(e.response?.data?.detail || 'Upload failed'),
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!file) return setError('Please select a PDF file')
    if (!ccId) return setError('Please select a cost center')

    let finalVendorId = vendorId
    if (!finalVendorId && newVendor.trim()) {
      const v = await createVendorMut.mutateAsync(newVendor.trim())
      finalVendorId = v.id
    }
    if (!finalVendorId) return setError('Please select or enter a vendor')

    uploadMut.mutate({ cost_center_id: ccId, vendor_id: finalVendorId, invoice_number: invoiceNumber || undefined, file })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Upload Invoice</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Cost Center *</label>
            <select className="input" value={ccId} onChange={e => setCcId(e.target.value)} required>
              <option value="">Select cost center...</option>
              {costCenters.map(cc => (
                <option key={cc.id} value={cc.id}>{cc.code} – {cc.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Vendor *</label>
            <select className="input mb-2" value={vendorId} onChange={e => { setVendorId(e.target.value); setNewVendor('') }}>
              <option value="">Select existing vendor...</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <p className="text-xs text-gray-400 mb-1">Or enter a new vendor name:</p>
            <input
              type="text"
              className="input"
              placeholder="New vendor name"
              value={newVendor}
              onChange={e => { setNewVendor(e.target.value); setVendorId('') }}
            />
          </div>

          <div>
            <label className="label">Invoice Number (optional)</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. INV-2024-001"
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Invoice PDF *</label>
            <input
              type="file"
              accept=".pdf"
              required
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-sigvaris-blue-pale file:text-sigvaris-blue hover:file:bg-blue-100 cursor-pointer"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={uploadMut.isPending} className="btn-primary flex-1 justify-center">
              {uploadMut.isPending ? 'Uploading...' : 'Upload Invoice'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function InvoicesPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showUpload, setShowUpload] = useState(false)

  const statusFilter = searchParams.get('status') as InvoiceStatus | null
  const ccFilter = searchParams.get('cost_center_id') || undefined

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices', statusFilter, ccFilter],
    queryFn: () => listInvoices({ status: statusFilter ?? undefined, cost_center_id: ccFilter }),
  })

  const { data: costCenters = [] } = useQuery({ queryKey: ['cost-centers'], queryFn: listCostCenters })

  const isFinance = user?.role === 'admin' || user?.role === 'super_admin'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        {isFinance && (
          <button onClick={() => setShowUpload(true)} className="btn-primary">
            + Upload Invoice
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          className="input w-auto"
          value={statusFilter ?? ''}
          onChange={e => {
            const v = e.target.value
            setSearchParams(v ? { status: v } : {})
          }}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          className="input w-auto"
          value={ccFilter ?? ''}
          onChange={e => {
            const v = e.target.value
            const p = statusFilter ? { status: statusFilter } : {}
            setSearchParams(v ? { ...p, cost_center_id: v } : p)
          }}
        >
          <option value="">All cost centers</option>
          {costCenters.map(cc => (
            <option key={cc.id} value={cc.id}>{cc.code} – {cc.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No invoices found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 font-medium text-gray-500">Vendor</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Cost Center</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Amount</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Due Date</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Uploaded</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoices.map(inv => {
                const cc = costCenters.find(c => c.id === inv.cost_center_id)
                return (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <Link to={`/invoices/${inv.id}`} className="font-medium text-sigvaris-blue hover:underline">
                        {inv.vendor.name}
                      </Link>
                      {inv.invoice_number && (
                        <span className="block text-xs text-gray-400">{inv.invoice_number}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{cc ? `${cc.code} – ${cc.name}` : '–'}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {inv.amount
                        ? Number(inv.amount).toLocaleString('de-CH', { style: 'currency', currency: 'CHF' })
                        : <span className="text-gray-300">–</span>}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {inv.due_date ? format(new Date(inv.due_date), 'dd MMM yyyy') : <span className="text-gray-300">–</span>}
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {format(new Date(inv.created_at), 'dd MMM yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={inv.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  )
}
