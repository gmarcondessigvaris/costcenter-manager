import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listInvoices, listCostCenters } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'
import type { Invoice } from '../types'

function StatusBadge({ status }: { status: Invoice['status'] }) {
  const map = {
    pending_assignment: <span className="badge-assignment">New</span>,
    pending_approval:   <span className="badge-pending">Pending approval</span>,
    approved:           <span className="badge-approved">Approved</span>,
    rejected:           <span className="badge-rejected">Rejected</span>,
  }
  return map[status]
}

export default function DashboardPage() {
  const { user } = useAuth()
  const isOwner   = user?.role === 'user'
  const isFinance = user?.role === 'admin' || user?.role === 'super_admin'

  const { data: allInvoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => listInvoices(),
  })

  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: listCostCenters,
  })

  const newInvoices   = allInvoices.filter(i => i.status === 'pending_assignment')
  const pendingApproval = allInvoices.filter(i => i.status === 'pending_approval')
  const myApprovals   = allInvoices.filter(i =>
    i.approval_steps.some(s => s.approver.id === user?.id && s.status === 'pending')
  )

  const stats = [
    { label: 'New Invoices',      value: newInvoices.length,      color: 'bg-blue-50 text-blue-700',           link: '/invoices?status=pending_assignment' },
    { label: 'Awaiting Approval', value: pendingApproval.length,  color: 'bg-yellow-50 text-yellow-700',       link: '/invoices?status=pending_approval' },
    { label: 'My Approvals',      value: myApprovals.length,      color: 'bg-orange-50 text-orange-700',       link: '/invoices?status=pending_approval' },
    { label: 'Cost Centers',      value: costCenters.length,      color: 'bg-sigvaris-blue-pale text-sigvaris-blue', link: '/cost-centers' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back, {user?.display_name}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <Link key={s.label} to={s.link} className={`card hover:shadow-md transition-shadow ${s.color}`}>
            <p className="text-3xl font-bold">{s.value}</p>
            <p className="text-sm font-medium mt-1 opacity-80">{s.label}</p>
          </Link>
        ))}
      </div>

      {/* NEW invoices â€” requires action from cost center owner */}
      {newInvoices.length > 0 && (
        <div className="card mb-6 border-l-4 border-blue-400">
          <h2 className="font-semibold text-gray-900 mb-1">
            ðŸ“¥ New invoices â€” action required
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            {isFinance
              ? 'These invoices are waiting to be processed by the cost center owner.'
              : 'Finance has uploaded these invoices to your cost center. Please set the amount, budget lines and approvers.'}
          </p>
          <div className="space-y-2">
            {newInvoices.map(inv => (
              <Link
                key={inv.id}
                to={`/invoices/${inv.id}`}
                className="flex items-center justify-between p-3 rounded-lg border border-blue-100 bg-blue-50/50 hover:bg-blue-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">PDF</div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{inv.vendor.name}</p>
                    <p className="text-xs text-gray-400">
                      {inv.cost_center && (
                        <span className="font-medium text-sigvaris-blue mr-1">{inv.cost_center.code}</span>
                      )}
                      Uploaded {format(new Date(inv.created_at), 'dd MMM yyyy')} by {inv.uploaded_by.display_name}
                    </p>
                  </div>
                </div>
                <span className="text-blue-600 text-xs font-medium">Process â†’</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Approvals waiting for me */}
      {myApprovals.length > 0 && (
        <div className="card mb-6 border-l-4 border-yellow-400">
          <h2 className="font-semibold text-gray-900 mb-1">âš¡ Your approval required</h2>
          <p className="text-xs text-gray-400 mb-3">It is your turn to review and approve these invoices.</p>
          <div className="space-y-2">
            {myApprovals.map(inv => (
              <Link
                key={inv.id}
                to={`/invoices/${inv.id}`}
                className="flex items-center justify-between p-3 rounded-lg border border-yellow-100 bg-yellow-50/50 hover:bg-yellow-50 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{inv.vendor.name}</p>
                    {inv.cost_center && (
                      <span className="text-xs bg-sigvaris-blue-pale text-sigvaris-blue px-1.5 py-0.5 rounded font-mono">
                        {inv.cost_center.code}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {inv.amount
                      ? Number(inv.amount).toLocaleString('de-CH', { style: 'currency', currency: 'CHF' })
                      : 'â€”'}
                    {inv.due_date && <span className="ml-2">Â· due {format(new Date(inv.due_date), 'dd MMM yyyy')}</span>}
                  </p>
                </div>
                <span className="text-yellow-700 text-xs font-medium">Review â†’</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent invoices */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Recent Invoices</h2>
          <Link to="/invoices" className="text-sigvaris-blue text-sm font-medium hover:underline">View all â†’</Link>
        </div>
        {allInvoices.length === 0 ? (
          <p className="text-gray-400 text-sm py-4 text-center">No invoices yet</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {allInvoices.slice(0, 8).map(inv => (
              <Link
                key={inv.id}
                to={`/invoices/${inv.id}`}
                className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-sigvaris-blue-pale rounded-lg flex items-center justify-center text-sigvaris-blue text-xs font-bold">PDF</div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{inv.vendor.name}</p>
                    <p className="text-xs text-gray-400">{format(new Date(inv.created_at), 'dd MMM yyyy')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {inv.amount && (
                    <span className="text-sm text-gray-600">
                      {Number(inv.amount).toLocaleString('de-CH', { style: 'currency', currency: 'CHF' })}
                    </span>
                  )}
                  <StatusBadge status={inv.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
