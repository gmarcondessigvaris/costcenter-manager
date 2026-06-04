import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

// Catch any unhandled startup error and display it instead of a blank page
window.addEventListener('error', (e) => {
  document.getElementById('root')!.innerHTML =
    `<div style="padding:2rem;font-family:monospace;color:#c00;white-space:pre-wrap">` +
    `<b>Startup error — please report this:</b>\n${e.message}\n${e.filename}:${e.lineno}\n\n${e.error?.stack ?? ''}</div>`
})
window.addEventListener('unhandledrejection', (e) => {
  document.getElementById('root')!.innerHTML =
    `<div style="padding:2rem;font-family:monospace;color:#c00;white-space:pre-wrap">` +
    `<b>Unhandled promise rejection:</b>\n${e.reason}</div>`
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AuthProvider>
  </React.StrictMode>,
)
