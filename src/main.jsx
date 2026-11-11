import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LangProvider } from './LangContext'
import { UserProfileProvider } from './UserProfileContext'
import ErrorBoundary from './components/ErrorBoundary'
import './theme.css'
import './index.css'

// Global defensive error shields to ensure background async failures never crash the whole app
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('[Global Guard] Handled async rejection:', event.reason)
    // Prevent default unhandled rejection alert or browser halt
    event.preventDefault?.()
  })

  window.addEventListener('error', (event) => {
    // If it's a script loading error or audio context error, prevent it from breaking the UI
    if (event.error?.name === 'AbortError' || event.message?.includes('ResizeObserver')) {
      event.preventDefault?.()
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary isRoot title="ระบบ Sofun">
      <LangProvider>
        <UserProfileProvider>
          <App />
        </UserProfileProvider>
      </LangProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
