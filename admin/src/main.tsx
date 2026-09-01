import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GlobalInteractionProvider } from '@/components/GlobalInteractionProvider'
import { AdminApp } from './app'
import './admin.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><GlobalInteractionProvider><AdminApp /></GlobalInteractionProvider></StrictMode>,
)
