import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/geist'
import { GlobalInteractionProvider } from '@/components/GlobalInteractionProvider'
import { AdminApp } from './app'
import './admin.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><GlobalInteractionProvider><AdminApp /></GlobalInteractionProvider></StrictMode>,
)
