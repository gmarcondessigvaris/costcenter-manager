import {
  AuthenticationResult,
  Configuration,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from '@azure/msal-browser'
import { MsalProvider, useMsal } from '@azure/msal-react'
import React, { createContext, useContext, useEffect, useState } from 'react'
import axios from 'axios'
import { getMe, setAuthToken } from '../services/api'
import type { User } from '../types'

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === 'true'

const TENANT_ID = import.meta.env.VITE_AZURE_TENANT_ID as string
const CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID as string

// ── Context ───────────────────────────────────────────────────────────────────

interface AuthCtx {
  user: User | null
  loading: boolean
  login: (opts?: { email?: string; displayName?: string }) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthCtx>({
  user: null, loading: true, login: async () => {}, logout: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

// ── Dev auth provider (no MSAL) ───────────────────────────────────────────────

function DevAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('dev_token')
    if (token) {
      setAuthToken(token)
      getMe()
        .then(setUser)
        .catch(() => { localStorage.removeItem('dev_token'); setAuthToken(null) })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  async function login(opts?: { email?: string; displayName?: string }) {
    const { data } = await axios.post('/api/auth/dev-login', {
      email: opts?.email,
      display_name: opts?.displayName,
    })
    localStorage.setItem('dev_token', data.token)
    setAuthToken(data.token)
    setUser(data.user)
  }

  function logout() {
    localStorage.removeItem('dev_token')
    setAuthToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Azure AD provider (MSAL) ──────────────────────────────────────────────────

const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID ?? '',
    authority: `https://login.microsoftonline.com/${TENANT_ID ?? ''}`,
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: 'sessionStorage' },
}

export const msalInstance = new PublicClientApplication(msalConfig)
const SCOPES = [`api://${CLIENT_ID}/user_impersonation`]

function AzureAuthInner({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  async function acquireToken(): Promise<string | null> {
    if (!accounts[0]) return null
    try {
      const result: AuthenticationResult = await instance.acquireTokenSilent({ scopes: SCOPES, account: accounts[0] })
      return result.accessToken
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        const result = await instance.acquireTokenPopup({ scopes: SCOPES })
        return result.accessToken
      }
      return null
    }
  }

  useEffect(() => {
    async function init() {
      await msalInstance.initialize()
      if (accounts.length > 0) {
        const token = await acquireToken()
        if (token) { setAuthToken(token); try { setUser(await getMe()) } catch { setUser(null) } }
      }
      setLoading(false)
    }
    init()
  }, [accounts.length])

  async function login() {
    await instance.loginPopup({ scopes: SCOPES })
    const token = await acquireToken()
    if (token) { setAuthToken(token); setUser(await getMe()) }
  }

  function logout() { setAuthToken(null); setUser(null); instance.logoutPopup() }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Root provider ─────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (DEV_AUTH) return <DevAuthProvider>{children}</DevAuthProvider>
  return (
    <MsalProvider instance={msalInstance}>
      <AzureAuthInner>{children}</AzureAuthInner>
    </MsalProvider>
  )
}
