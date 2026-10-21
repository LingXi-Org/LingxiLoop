import { createRoot } from 'react-dom/client'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { openSettingsDialog, SETTINGS_DIALOG_TRIGGER_ID } from '@/features/settings/store'
import { Toaster } from '@/components/ui/sonner'
import { fixture, useWorkspace } from './boundary'
import '@/styles/globals.css'

Object.assign(window, { fixture, changeScope: () => useWorkspace.setState({ selectedId: 'other-project' }) })
createRoot(document.getElementById('root')!).render(<>
  <button id={SETTINGS_DIALOG_TRIGGER_ID} onClick={() => openSettingsDialog('data-account')}>打开设置</button>
  <SettingsDialog /><Toaster />
</>)
