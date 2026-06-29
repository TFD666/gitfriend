import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import App from './App'

// Apply persisted theme before first render to avoid flash
const savedTheme = localStorage.getItem('theme')
if (savedTheme === 'light') {
  document.documentElement.setAttribute('data-theme', 'light')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
