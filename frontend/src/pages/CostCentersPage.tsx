import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listCostCenters, createCostCenter, addMember, removeMember, searchUsers,
} from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import type { CostCenter, User } from '../types'

function MemberRow({ member, ccId, isAdmin }: {
  member: { id: string; user: User; role: string }
  ccId: string
  isAdmin: boolean
}) {
  const qc = useQueryClient()
  const removeMut = useMutation({
    mutationFn: () => removeMember(ccId, member.user.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cost-centers'] }),
  })

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-sigvaris-blue-pale text-sigvaris-blue text-xs flex items-center justify-center font-bold">
          {member.user.display_name[0]}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{member.user.display_name}</p>
          <p className="text-xs text-gray-400">{member.user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 capitalize">{member.role}</span>
        {isAdmin && (
          <button
            onClick={() => removeMut.mutate()}
            disabled={removeMut.isPending}
            className="text-red-400 hover:text-red-600 text-xs"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

function AddMemberForm({ ccId }: { ccId: string }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<User | null>(null)
  const [role, setRole] = useState('owner')
  const [open, setOpen] = useState(false)

  const { data: results = [] } = useQuery({
    queryKey: ['user-search', q],
    queryFn: () => searchUsers(q),
    enabled: q.length >= 2,
  })

  const addMut = useMutation({
    mutationFn: () => addMember(ccId, selected!.id, role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cost-centers'] }); setSelected(null); setQ('') },
  })

  return (
    <div className="pt-3 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-500 mb-2">Add Member</p>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          {selected ? (
            <div className="flex items-center gap-1 p-2 border border-gray-200 rounded-lg bg-gray-50 text-sm">
              {selected.display_name}
              <button onClick={() => setSelected(null)} className="ml-auto text-gray-400">×</button>
            </div>
          ) : (
            <>
              <input
                type="text"
                className="input text-sm"
                placeholder="Search user…"
                value={q}
                onChange={e => { setQ(e.target.value); setOpen(true) }}
              />
              {open && results.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow max-h-36 overflow-y-auto">
                  {results.map(u => (
                    <li
                      key={u.id}
                      className="px-3 py-2 text-xs hover:bg-sigvaris-blue-pale cursor-pointer"
                      onMouseDown={() => { setSelected(u); setQ(''); setOpen(false) }}
                    >
                      {u.display_name} <span className="text-gray-400">{u.email}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <select className="input w-28 text-sm" value={role} onChange={e => setRole(e.target.value)}>
          <option value="owner">Owner</option>
          <option value="viewer">Viewer</option>
        </select>
        <button
          onClick={() => addMut.mutate()}
          disabled={!selected || addMut.isPending}
          className="btn-primary text-sm px-3"
        >
          Add
        </button>
      </div>
    </div>
  )
}

function CostCenterCard({ cc }: { cc: CostCenter }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs bg-sigvaris-blue-pale text-sigvaris-blue px-2 py-0.5 rounded font-medium">
              {cc.code}
            </span>
            {!cc.is_active && <span className="text-xs text-gray-400">(inactive)</span>}
          </div>
          <h3 className="font-semibold text-gray-900 mt-1">{cc.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{cc.members.length} member{cc.members.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-gray-400 hover:text-gray-600 text-xs"
        >
          {expanded ? '▲ Hide' : '▼ Members'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4">
          <div className="divide-y divide-gray-50">
            {cc.members.map(m => (
              <MemberRow key={m.id} member={m} ccId={cc.id} isAdmin={isAdmin} />
            ))}
            {cc.members.length === 0 && (
              <p className="text-gray-400 text-xs py-2">No members yet</p>
            )}
          </div>
          {isAdmin && <AddMemberForm ccId={cc.id} />}
        </div>
      )}
    </div>
  )
}

export default function CostCentersPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isAdmin = user?.role === 'admin'
  const [showCreate, setShowCreate] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState('')

  const { data: costCenters = [], isLoading } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: listCostCenters,
  })

  const createMut = useMutation({
    mutationFn: () => createCostCenter({ code: newCode, name: newName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cost-centers'] })
      setShowCreate(false)
      setNewCode('')
      setNewName('')
    },
    onError: (e: any) => setCreateError(e.response?.data?.detail || 'Failed to create'),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cost Centers</h1>
        {isAdmin && (
          <button onClick={() => setShowCreate(s => !s)} className="btn-primary">
            + New Cost Center
          </button>
        )}
      </div>

      {showCreate && (
        <div className="card mb-6 border-2 border-sigvaris-blue/20">
          <h2 className="font-semibold text-gray-900 mb-4">Create Cost Center</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Code *</label>
              <input type="text" className="input" value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="e.g. CC-1001" />
            </div>
            <div>
              <label className="label">Name *</label>
              <input type="text" className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Marketing EMEA" />
            </div>
          </div>
          {createError && <p className="text-red-600 text-sm mt-2">{createError}</p>}
          <div className="flex gap-3 mt-4">
            <button onClick={() => createMut.mutate()} disabled={!newCode || !newName || createMut.isPending} className="btn-primary">
              Create
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : costCenters.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          No cost centers yet{isAdmin ? ' — create one above' : ''}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {costCenters.map(cc => <CostCenterCard key={cc.id} cc={cc} />)}
        </div>
      )}
    </div>
  )
}
