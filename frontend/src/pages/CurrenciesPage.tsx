import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listCurrencies, createCurrency, updateCurrency, getOnlineRates, getSettings, updateSetting } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'
import { format } from 'date-fns'

export default function CurrenciesPage() {
  const { user, loading } = useAuth()
  const qc = useQueryClient()

  const [showAdd, setShowAdd]             = useState(false)
  const [newCode, setNewCode]             = useState('')
  const [newName, setNewName]             = useState('')
  const [newRate, setNewRate]             = useState('')
  const [editId, setEditId]               = useState<string | null>(null)
  const [editRate, setEditRate]           = useState('')
  const [editName, setEditName]           = useState('')
  const [error, setError]                 = useState('')
  const [onlinePreview, setOnlinePreview] = useState<Record<string, number> | null>(null)
  const [fetchingOnline, setFetchingOnline] = useState(false)
  const [onlineError, setOnlineError]     = useState('')

  const { data: currencies = [], isLoading } = useQuery({ queryKey: ['currencies'], queryFn: listCurrencies })
  const { data: settings = {} }              = useQuery({ queryKey: ['settings'], queryFn: getSettings })

  const rateMode: 'auto' | 'manual' = (settings as any)['exchange_rate_mode'] === 'auto' ? 'auto' : 'manual'

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
  const modeMut = useMutation({
    mutationFn: (mode: string) => updateSetting('exchange_rate_mode', mode),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
  // Apply a single online rate to the currencies table
  const applyRateMut = useMutation({
    mutationFn: ({ id, rate }: { id: string; rate: number }) => updateCurrency(id, { rate_to_chf: rate }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['currencies'] }),
  })
  // Apply all online rates at once
  const applyAllMut = useMutation({
    mutationFn: async () => {
      const active = (currencies as any[]).filter((c: any) => c.is_active && c.code !== 'CHF')
      for (const c of active) {
        const onlineRate = onlinePreview?.[c.code]
        if (onlineRate) await updateCurrency(c.id, { rate_to_chf: onlineRate })
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['currencies'] }); setOnlinePreview(null) },
  })

  async function handleFetchOnline() {
    setFetchingOnline(true)
    setOnlineError('')
    try {
      const rates = await getOnlineRates()
      setOnlinePreview(rates)
    } catch (e: any) {
      setOnlineError(e.response?.data?.detail || 'Could not fetch online rates')
    } finally {
      setFetchingOnline(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>
  if (user?.role !== 'super_admin' && user?.role !== 'admin') return <Navigate to="/dashboard" replace />

  const active   = (currencies as any[]).filter((c: any) => c.is_active)
  const inactive = (currencies as any[]).filter((c: any) => !c.is_active)

  function startEdit(c: any) { setEditId(c.id); setEditRate(String(c.rate_to_chf)); setEditName(c.name) }

  return (
    <div>
      {/* Header + mode toggle */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exchange Rates</h1>
          <p className="text-sm text-gray-400 mt-0.5">1 unit of currency = X CHF</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <button
              onClick={() => modeMut.mutate('auto')}
              className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                rateMode === 'auto'
                  ? 'bg-sigvaris-blue text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              ⚡ Automatic
            </button>
            <button
              onClick={() => modeMut.mutate('manual')}
              className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                rateMode === 'manual'
                  ? 'bg-sigvaris-blue text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              ✏️ Manual
            </button>
          </div>
          <p className="text-xs text-gray-400 text-right">
            {rateMode === 'auto'
              ? 'Reports use live ECB rates fetched at generation time'
              : 'Reports use the rates entered below'}
          </p>
        </div>
      </div>

      {/* Online rates panel */}
      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">Copy rates from online</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Fetches current ECB rates via{' '}
              <span className="font-mono text-gray-500">frankfurter.app</span>
              {rateMode === 'auto' && ' — these are what reports use automatically'}
            </p>
          </div>
          <button
            onClick={handleFetchOnline}
            disabled={fetchingOnline}
            className="btn-secondary text-sm"
          >
            {fetchingOnline ? 'Fetching…' : '🌐 Fetch online rates'}
          </button>
        </div>

        {onlineError && <p className="text-red-600 text-sm mt-3">{onlineError}</p>}

        {onlinePreview && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-600">Current ECB rates — click Apply to update a currency</p>
              <div className="flex gap-2">
                <button onClick={() => applyAllMut.mutate()} disabled={applyAllMut.isPending}
                  className="btn-primary text-xs px-3 py-1.5">
                  {applyAllMut.isPending ? 'Applying…' : 'Apply all'}
                </button>
                <button onClick={() => setOnlinePreview(null)} className="btn-secondary text-xs px-3 py-1.5">
                  Dismiss
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {(currencies as any[])
                .filter((c: any) => c.is_active && c.code !== 'CHF' && onlinePreview[c.code])
                .map((c: any) => {
                  const onlineRate = onlinePreview[c.code]
                  const stored     = Number(c.rate_to_chf)
                  const diff       = ((onlineRate - stored) / stored) * 100
                  return (
                    <div key={c.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                      <div>
                        <span className="font-mono font-bold text-sigvaris-blue">{c.code}</span>
                        <p className="font-mono text-gray-700 mt-0.5">{onlineRate.toFixed(6)}</p>
                        {Math.abs(diff) > 0.01 && (
                          <p className={`mt-0.5 ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(2)}%
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => applyRateMut.mutate({ id: c.id, rate: onlineRate })}
                        disabled={applyRateMut.isPending}
                        className="ml-2 text-xs px-2 py-1 bg-sigvaris-blue text-white rounded hover:bg-sigvaris-blue-light disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
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
              <input className="input" placeholder="e.g. Euro" value={newName} onChange={e => setNewName(e.target.value)} />
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

      {/* Active currencies table */}
      <div className="card p-0 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Active Currencies</h2>
          <button onClick={() => setShowAdd(s => !s)} className="btn-primary text-sm">+ Add Currency</button>
        </div>
        {isLoading ? <div className="p-8 text-center text-gray-400">Loading…</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 font-medium text-gray-500 w-24">Code</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Name</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500">
                  Rate to CHF {rateMode === 'auto' && <span className="text-xs text-sigvaris-blue font-normal">(stored)</span>}
                </th>
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
                      <input className="input text-sm py-1 text-right w-32 ml-auto block" type="number" step="0.000001"
                        value={editRate} onChange={e => setEditRate(e.target.value)} />
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
                      ) : c.code !== 'CHF' ? (
                        <>
                          <button onClick={() => startEdit(c)} className="btn-secondary text-xs px-3 py-1.5">Edit rate</button>
                          <button onClick={() => toggleMut.mutate({ id: c.id, is_active: false })}
                            className="text-xs text-gray-400 hover:text-red-600 transition-colors px-2">
                            Deactivate
                          </button>
                        </>
                      ) : null}
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
            <h2 className="font-semibold text-gray-400 text-sm">Inactive Currencies</h2>
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
