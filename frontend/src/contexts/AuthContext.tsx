import {
  AuthenticationResult,
  Configuration,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from '@azure/msal-browser'
import { MsalProvider, useMsal } from '@azure/msal-react'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { getMe, setAuthToken } from '../services/api'
import type { User } from '../types'

const TENANT_ID = import.meta.env.VITE_AZURE_TENANT_ID as string
const CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID as string

const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: 'sessionStorage' },
}

export const msalInstance = new PublicClientApplication(msalConfig)

const SCOPES = [`api://${CLIENT_ID}/user_impersonation`]

// ── Context ───────────────────────────────────────────────────────────────────

interface AuthCtx {
  user: User | null
  loading: boolean
  login: () => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

function AuthInner({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  async function acquireToken(): Promise<string | null> {
    if (!accounts[0]) return null
    try {
      const result: AuthenticationResult = await instance.acquireTokenSilent({
        scopes: SCOPES,
        account: accounts[0],
      })
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
        if (token) {
          setAuthToken(token)
          try {
            const me = await getMe()
            setUser(me)
          } catch {
            setUser(null)
          }
        }
      }
      setLoading(false)
    }
    init()
  }, [accounts.length])

  async function login() {
    await instance.loginPopup({ scopes: SCOPES })
    const token = await acquireToken()
    if (token) {
      setAuthToken(token)
      const me = await getMe()
      setUser(me)
    }
  }

  function logout() {
    setAuthToken(null)
    setUser(null)
    instance.logoutPopup()
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <MsalProvider instance={msalInstance}>
      <AuthInner>{children}</AuthInner>
    </MsalProvider>
  )
}
