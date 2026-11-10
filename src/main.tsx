import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// La build "single file" (demo pubblicata come pagina unica) non ha URL propri: usa il router in memoria.
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router basename={import.meta.env.VITE_ROUTER === 'memory' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      <App />
    </Router>
  </StrictMode>,
)
