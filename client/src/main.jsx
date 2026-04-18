import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { BrowserRouter } from 'react-router-dom'

try {
  const storedTheme = String(localStorage.getItem('nos_theme_preference_v2') || '').trim().toLowerCase()
  if (storedTheme === 'dark' || storedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', storedTheme)
  } else {
    document.documentElement.setAttribute('data-theme', 'dark')
  }
} catch {
  // Ignore theme bootstrap errors.
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
