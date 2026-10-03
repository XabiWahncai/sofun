import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LangProvider } from './LangContext'
import { UserProfileProvider } from './UserProfileContext'
import './theme.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LangProvider>
      <UserProfileProvider>
        <App />
      </UserProfileProvider>
    </LangProvider>
  </React.StrictMode>
)
