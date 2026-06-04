import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import logo from '../assets/logo.svg'

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true'

export default function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!loading && user) navigate('/dashboard', { replace: true })
  }, [user, loading, navigate])

  async function handleDevLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login({ email, displayName: name })
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || String(err)
      setError(`Login failed: ${detail}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-sigvaris-blue flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-sm text-center">
        <img src={logo} alt="SIGVARIS" className="h-12 mx-auto mb-2" />
        <p className="text-gray-500 text-sm mb-8">Cost Center Manager</p>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome</h1>

        {DEV_AUTH ? (
          <>
            <p className="text-gray-500 text-sm mb-6">Sign in to continue.</p>
            <form onSubmit={handleDevLogin} className="text-left space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Gustavo Marcondes"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  placeholder="gustavo.marcondes@sigvaris.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button type="submit" disabled={busy} className="btn-primary w-full justify-center py-3">
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-8">
              Sign in with your SIGVARIS Microsoft account to continue.
            </p>
            <button
              onClick={() => login()}
              disabled={loading}
              className="btn-primary w-full justify-center py-3 text-base"
            >
              <svg className="w-5 h-5" viewBox="0 0 23 23" fill="none">
                <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
                <path fill="#f35325" d="M1 1h10v10H1z"/>
                <path fill="#81bc06" d="M12 1h10v10H12z"/>
                <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                <path fill="#ffba08" d="M12 12h10v10H12z"/>
              </svg>
              Sign in with Microsoft
            </button>
          </>
        )}

        <p className="text-gray-400 text-xs mt-8">Internal use only · SIGVARIS GROUP</p>
      </div>
    </div>
  )
}
