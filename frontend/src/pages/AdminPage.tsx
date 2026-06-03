import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listUsers, updateUserRole, createUser, deactivateUser } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'
import type { UserRole } from '../types'

const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin:       'bg-blue-100 text-blue-700',
  user:        'bg-gray-100 text-gray-600',
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  user:        'CC Owner',
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [name,  setName]  = useState('')
  const [email, setEmail] = useState('')
  const [role,  setRole]  = useState('user')
  const [error, setError] = useState('')
  const { user: actor } = useAuth()

  const createMut = useMutation({
    mutationFn: () => createUser({ display_name: name, email, role }),
    onSuccess: () => { setName(''); setEmail(''); setRole('user'); setError(''); onCreated() },
    onError: (e: any) => setError(e.response?.data?.detail || 'Failed to create user'),
  })

  return (
    <div className="card mb-6">
      <h2 className="font-semibold text-gray-900 mb-4">Add User</h2>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">Full Name *</label>
          <input type="text" className="input" placeholder="e.g. Maria Silva"
            value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Email *</label>
          <input type="email" className="input" placeholder="e.g. maria.silva@sigvaris.com"
            value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={e => setRole(e.target.value)}>
            <option value="user">CC Owner</option>
            <option value="admin">Admin</option>
            {actor?.role === 'super_admin' && (
              <option value="super_admin">Super Admin</option>
            )}
          </select>
        </div>
      </div>
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      <div className="mt-4">
        <button onClick={() => createMut.mutate()} disabled={!name.trim() || !email.trim() || createMut.isPending} className="btn-primary">
          {createMut.isPending ? 'Creating…' : 'Create User'}
        </button>
        <p className="text-xs text-gray-400 mt-2">The user signs in with this email on the login page to access the app.</p>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const { user: actor, loading } = useAuth()
  const qc = useQueryClient()
  const [deactivating, setDeactivating] = useState<string | null>(null)
  const [deactivateError, setDeactivateError] = useState<Record<string, string>>({})

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: listUsers })

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => updateUserRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const deactivateMut = useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setDeactivating(null) },
    onError: (e: any, id) => {
      setDeactivateError(prev => ({ ...prev, [id]: e.response?.data?.detail || 'Cannot deactivate' }))
      setDeactivating(null)
    },
  })

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>
  if (actor?.role !== 'super_admin' && actor?.role !== 'admin') return <Navigate to="/dashboard" replace />

  const isSuperAdmin = actor?.role === 'super_admin'

  // Determine if the current actor can manage a given user
  const canManage = (u: any) => {
    if (u.id === actor?.id) return false // can't touch yourself
    if (!isSuperAdmin && (u.role === 'admin' || u.role === 'super_admin')) return false
    return true
  }

  // Role options the actor can assign
  const roleOptions = isSuperAdmin
    ? [{ value: 'user', label: 'CC Owner' }, { value: 'admin', label: 'Admin' }, { value: 'super_admin', label: 'Super Admin' }]
    : [{ value: 'user', label: 'CC Owner' }, { value: 'admin', label: 'Admin' }]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {isSuperAdmin ? 'Super Admin' : 'Admin'} — User Management
      </h1>

      <CreateUserForm onCreated={() => qc.invalidateQueries({ queryKey: ['users'] })} />

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">All Users</h2>
          <p className="text-xs text-gray-400">{users.length} users</p>
        </div>
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 font-medium text-gray-500">User</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Email</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Role</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">CCs</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Change Role</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-sigvaris-blue-pale text-sigvaris-blue text-xs flex items-center justify-center font-bold">
                        {u.display_name[0]}
                      </div>
                      <span className="font-medium text-gray-900">{u.display_name}</span>
                      {u.id === actor?.id && <span className="text-xs text-gray-400">(you)</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role as UserRole] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ROLE_LABELS[u.role as UserRole] ?? u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {Number(u.cc_count) > 0 ? (
                      <span className="text-xs bg-sigvaris-blue-pale text-sigvaris-blue px-2 py-0.5 rounded-full font-medium">
                        {u.cc_count} CC{Number(u.cc_count) > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {canManage(u) ? (
                      <select className="input w-36 text-xs py-1" value={u.role}
                        onChange={e => roleMut.mutate({ id: u.id, role: e.target.value })}>
                        {roleOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {canManage(u) && (
                      <div>
                        {deactivating === u.id ? (
                          <div className="flex items-center gap-2 justify-end">
                            <span className="text-xs text-gray-500">Confirm?</span>
                            <button onClick={() => deactivateMut.mutate(u.id)}
                              className="text-xs text-red-600 font-medium hover:underline">Yes</button>
                            <button onClick={() => { setDeactivating(null); setDeactivateError(prev => ({ ...prev, [u.id]: '' })) }}
                              className="text-xs text-gray-400 hover:text-gray-600">No</button>
                          </div>
                        ) : (
                          <button onClick={() => { setDeactivating(u.id); setDeactivateError(prev => ({ ...prev, [u.id]: '' })) }}
                            className="text-xs text-gray-400 hover:text-red-600 transition-colors">
                            Deactivate
                          </button>
                        )}
                        {deactivateError[u.id] && (
                          <p className="text-xs text-red-600 mt-1 text-right max-w-48 ml-auto">{deactivateError[u.id]}</p>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
