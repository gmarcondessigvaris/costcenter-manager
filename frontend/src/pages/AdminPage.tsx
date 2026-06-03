import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listUsers, updateUserRole } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'
import type { UserRole } from '../types'

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  finance: 'bg-blue-100 text-blue-700',
  user: 'bg-gray-100 text-gray-600',
}

export default function AdminPage() {
  const { user } = useAuth()
  const qc = useQueryClient()

  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
  })

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => updateUserRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin — User Management</h1>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 font-medium text-gray-500">User</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Email</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Role</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Change Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-sigvaris-blue-pale text-sigvaris-blue text-xs flex items-center justify-center font-bold">
                        {u.display_name[0]}
                      </div>
                      <span className="font-medium text-gray-900">{u.display_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role]}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {u.id !== user.id && (
                      <select
                        className="input w-32 text-xs py-1"
                        value={u.role}
                        onChange={e => roleMut.mutate({ id: u.id, role: e.target.value })}
                      >
                        <option value="user">user</option>
                        <option value="finance">finance</option>
                        <option value="admin">admin</option>
                      </select>
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
