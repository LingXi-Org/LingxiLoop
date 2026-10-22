import { MessageProvider, PartByIndexProvider, ReadonlyThreadProvider } from '@assistant-ui/react'
import { useMemo, type ReactNode } from 'react'
import type { HistoryActivityEntry } from './runActivityHistory'

/** The owning NativePart also receives its existing readOnly rendering context. */
export function HistoryActivityScope({ entry, children }: { entry: HistoryActivityEntry; children: ReactNode }) {
  const messages = useMemo(() => [entry.message], [entry.message])
  return <ReadonlyThreadProvider messages={messages}>
    <MessageProvider message={entry.message} index={0}>
      <PartByIndexProvider index={0}>{children}</PartByIndexProvider>
    </MessageProvider>
  </ReadonlyThreadProvider>
}
