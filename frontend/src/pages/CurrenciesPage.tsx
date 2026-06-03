import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listCurrencies, createCurrency, updateCurrency } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'
import { format } from 'date-fns'

export default function CurrenciesPage() {
  const { user } = useAuth()
  const qc = useQueryClient()

  const [showAdd, setShowAdd]   = useState(false)
  const [newCode, setNewCode]   = useState('')
  const [newName, setNewName]   = useState('')
  const [newRate, setNewRate]   = useState('')
  const [editId, setEditId]     = useState<string | null>(null)
  const [editRate, setEditRate] = useState('')
  const [editName, setEditName] = useState('')
  const [error, setError]       = useState('')

  // All hooks before any conditional return
  const { data: currencies = [], isLoading } = useQuery({
    queryKey: ['currencies'],
    queryFn:  listCurrencies,
  })

  const createMut = useMutation({
    mutationFn: () => createCurrency({ code: newCode.toUpperCase().trim(), name: newName.trim(), rate_to_chf: parseFloat(newRate) }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['currencies'] }); setShowAdd(false); setNewCode(''); setNewName(''); setNewRate(''); setError('') },
    onError:    (e: any) => setError(e.response?.data?.detail || 'Failed'),
  })

  const updateMut = useMutation({
    mutationFn: (id: string) => updateCurrency(id, { name: editName, rate_to_chf: parseFloat(editRate) }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['currencies'] }); setEditId(null) },
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => updateCurrency(id, { is_active }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['currencies'] }),
  })

  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />

  const active   = currencies.filter((c: any) => c.is_active)
  const inactive = currencies.filter((c: any) => !c.is_active)

  function startEdit(c: any) {
    setEditId(c.id); setEditRate(String(c.rate_to_chf)); setEditName(c.name)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exchange Rates</h1>
          <p className="text-sm text-gray-400 mt-0.5">All rates are expressed as: 1 unit of currency = X CHF</p>
        </div>
        <button onClick={() => setShowAdd(s => !s)} className="btn-primary">+ Add Currency</button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card mb-6 border-2 border-sigvaris-blue/20">
          <h2 className="font-semibold text-gray-900 mb-4">New Currency</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">ISO Code *</label>
              <input className="input uppercase" placeholder="e.g. EUR" maxLength={3}
                value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="label">Name *</label>
              <input className="input" placeholder="e.g. Euro"
                value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div>
              <label className="label">Rate to CHF *</label>
              <input className="input" type="number" step="0.000001" placeholder="e.g. 1.05"
                value={newRate} onChange={e => setNewRate(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button onClick={() => createMut.mutate()} disabled={!newCode || !newName || !newRate || createMut.isPending} className="btn-primary">
              {createMut.isPending ? 'Saving…' : 'Add Currency'}
            </button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Active currencies */}
      <div className="card p-0 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Active Currencies</h2>
        </div>
        {isLoading ? <div className="p-8 text-center text-gray-400">Loading…</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 font-medium text-gray-500 w-24">Code</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Name</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500">Rate to CHF</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Last updated</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {active.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <span className="font-mono font-bold text-sigvaris-blue">{c.code}</span>
                  </td>
                  <td className="px-6 py-3 text-gray-700">
                    {editId === c.id
                      ? <input className="input text-sm py-1" value={editName} onChange={e => setEditName(e.target.value)} />
                      : c.name}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {editId === c.id ? (
                      <input className="input text-sm py-1 text-right w-32 ml-auto block"
                        type="number" step="0.000001" value={editRate}
                        onChange={e => setEditRate(e.target.value)} />
                    ) : (
                      <span className="font-mono font-semibold text-gray-900">{Number(c.rate_to_chf).toFixed(6)}</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-400">
                    {c.updated_by && <span>{c.updated_by} · </span>}
                    {format(new Date(c.updated_at), 'dd MMM yyyy HH:mm')}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {editId === c.id ? (
                        <>
                          <button onClick={() => updateMut.mutate(c.id)} disabled={updateMut.isPending} className="btn-primary text-xs px-3 py-1.5">Save</button>
                          <button onClick={() => setEditId(null)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                        </>
                      ) : (
                        <>
                          {c.code !== 'CHF' && (
                            <>
                              <button onClick={() => startEdit(c)} className="btn-secondary text-xs px-3 py-1.5">Edit rate</button>
                              <button onClick={() => toggleMut.mutate({ id: c.id, is_active: false })}
                                className="text-xs text-gray-400 hover:text-red-600 transition-colors px-2">
                                Deactivate
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Inactive currencies */}
      {inactive.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-gray-400">Inactive Currencies</h2>
          </div>
          <table className="w-full text-sm opacity-60">
            <tbody className="divide-y divide-gray-50">
              {inactive.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 w-24"><span className="font-mono font-bold">{c.code}</span></td>
                  <td className="px-6 py-3 text-gray-500">{c.name}</td>
                  <td className="px-6 py-3 text-right font-mono">{Number(c.rate_to_chf).toFixed(6)}</td>
                  <td className="px-6 py-3" />
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => toggleMut.mutate({ id: c.id, is_active: true })}
                      className="btn-secondary text-xs px-3 py-1.5 opacity-100">
                      Reactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
