import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listVendors, createVendor, updateVendor, archiveVendor, restoreVendor } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'
import type { Vendor } from '../types'

function VendorForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Vendor
  onSave: (data: { name: string; description: string; address: string }) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [name,        setName]        = useState(initial?.name        ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [address,     setAddress]     = useState(initial?.address     ?? '')

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Vendor Name *</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Accenture AG" />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Short description of what this vendor provides" />
      </div>
      <div>
        <label className="label">Address</label>
        <textarea className="input" rows={2} value={address} onChange={e => setAddress(e.target.value)}
          placeholder="Street, City, Country" />
      </div>
      <div className="flex gap-3 pt-1">
        <button
          onClick={() => onSave({ name, description, address })}
          disabled={!name.trim() || isPending}
          className="btn-primary"
        >
          {isPending ? 'Saving…' : initial ? 'Save Changes' : 'Create Vendor'}
        </button>
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
      </div>
    </div>
  )
}

function VendorRow({ vendor }: { vendor: Vendor }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)

  const updateMut = useMutation({
    mutationFn: (data: { name: string; description: string; address: string }) =>
      updateVendor(vendor.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); setEditing(false) },
  })

  const archiveMut = useMutation({
    mutationFn: () => archiveVendor(vendor.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  })

  const restoreMut = useMutation({
    mutationFn: () => restoreVendor(vendor.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  })

  return (
    <div className={`p-4 rounded-lg border ${vendor.is_active ? 'border-gray-100 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
      {editing ? (
        <VendorForm
          initial={vendor}
          onSave={data => updateMut.mutate(data)}
          onCancel={() => setEditing(false)}
          isPending={updateMut.isPending}
        />
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900">{vendor.name}</p>
              {!vendor.is_active && (
                <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Archived</span>
              )}
            </div>
            {vendor.description && (
              <p className="text-sm text-gray-600 mt-0.5">{vendor.description}</p>
            )}
            {vendor.address && (
              <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-line">{vendor.address}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {vendor.is_active ? (
              <>
                <button onClick={() => setEditing(true)} className="btn-secondary text-xs px-3 py-1.5">
                  Edit
                </button>
                <button
                  onClick={() => archiveMut.mutate()}
                  disabled={archiveMut.isPending}
                  className="text-xs text-gray-400 hover:text-red-600 transition-colors px-2 py-1.5"
                >
                  Archive
                </button>
              </>
            ) : (
              <button
                onClick={() => restoreMut.mutate()}
                disabled={restoreMut.isPending}
                className="btn-secondary text-xs px-3 py-1.5"
              >
                Restore
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function VendorsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [createError, setCreateError] = useState('')

  if (user?.role !== 'super_admin' && user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors', showArchived],
    queryFn: () => listVendors(showArchived),
  })

  const createMut = useMutation({
    mutationFn: createVendor,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      setShowCreate(false)
      setCreateError('')
    },
    onError: (e: any) => setCreateError(e.response?.data?.detail || 'Failed to create vendor'),
  })

  const filtered = vendors.filter(v =>
    !search || v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.description?.toLowerCase().includes(search.toLowerCase())
  )

  const active   = filtered.filter(v => v.is_active)
  const archived = filtered.filter(v => !v.is_active)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
        <button onClick={() => setShowCreate(s => !s)} className="btn-primary">
          + New Vendor
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card mb-6 border-2 border-sigvaris-blue/20">
          <h2 className="font-semibold text-gray-900 mb-4">New Vendor</h2>
          <VendorForm
            onSave={data => createMut.mutate(data)}
            onCancel={() => { setShowCreate(false); setCreateError('') }}
            isPending={createMut.isPending}
          />
          {createError && <p className="text-red-600 text-sm mt-3">{createError}</p>}
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-3 mb-4">
        <input
          className="input max-w-sm"
          placeholder="Search vendors…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={e => setShowArchived(e.target.checked)}
            className="rounded"
          />
          Show archived
        </label>
      </div>

      {isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-3">
          {active.length === 0 && !showArchived && (
            <div className="card text-center py-12 text-gray-400">
              No vendors yet — create one above.
            </div>
          )}

          {active.map(v => <VendorRow key={v.id} vendor={v} />)}

          {showArchived && archived.length > 0 && (
            <>
              <p className="text-xs text-gray-400 font-medium pt-2">Archived</p>
              {archived.map(v => <VendorRow key={v.id} vendor={v} />)}
            </>
          )}

          {showArchived && archived.length === 0 && active.length === 0 && (
            <div className="card text-center py-12 text-gray-400">No vendors found.</div>
          )}
        </div>
      )}
    </div>
  )
}
