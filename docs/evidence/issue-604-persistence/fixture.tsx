import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { CasesPage } from '../../../src/features/cases/CasesPage'
import { useAuth } from '../../../src/stores/auth'
import '../../../src/styles/app.css'
useAuth.setState({ authenticated: true, ready: true, activeCompanyId: 'case604-school',
  user: { id: 'case604-owner', name: '案例测试教师', email: 'case604@test.invalid' },
  companies: [{ id: 'case604-school', name: '案例测试学校', slug: 'case604-school', role: 'teacher', isAdmin: true, status: 'ACTIVE' }],
})
createRoot(document.getElementById('root')!).render(<ThemeProvider attribute="class" defaultTheme="light"><div style={{ height: '100vh' }}><CasesPage /></div></ThemeProvider>)
