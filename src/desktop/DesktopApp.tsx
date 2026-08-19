import { useEffect } from 'react'
import { EmailComposer } from '@/components/EmailComposer'
import { isElectron, platform } from '@/lib/runtime'
import { useTheme } from '@/stores/theme'
import { ConversationsPane } from './ConversationsPane'
import { ChatPane } from './ChatPane'
import { MeView } from './MeView'
import { useApp } from '@/stores/app'

/** The desktop product has one shape: workspace left, conversation right. */
export function DesktopApp() {
  const theme = useTheme((s) => s.theme)
  const view = useApp((s) => s.view)

  useEffect(() => {
    window.lingxiloop?.windowChrome?.setTheme(theme)
  }, [theme])

  return (
    <div
      className="desktop-openmaus relative grid h-screen w-screen min-h-0 overflow-hidden bg-app"
      style={{ gridTemplateColumns: '320px minmax(0, 1fr)' }}
      data-electron={isElectron ? 'true' : 'false'}
      data-platform={platform}
    >
      {view === 'me' ? (
        <div className="col-span-2 min-h-0 overflow-hidden"><MeView /></div>
      ) : (
        <>
          <ConversationsPane />
          <ChatPane />
        </>
      )}
      <EmailComposer />
    </div>
  )
}
