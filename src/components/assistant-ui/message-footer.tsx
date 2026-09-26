import { createContext, type ReactNode, useContext } from 'react'

export const MessageFooterContext = createContext<ReactNode>(null)

/** Only the outer content surface owns the message footer, never its nested cards. */
export function MessageFooterContents({ children, inset = true }: { children: ReactNode; inset?: boolean }) {
  const footer = useContext(MessageFooterContext)
  return <MessageFooterContext.Provider value={null}>
    {footer ? <div className="flex min-w-0 items-end gap-x-2 gap-y-[inherit]">
      <div className="flex min-w-0 flex-1 flex-col gap-y-[inherit]">{children}</div>
      <div className={`shrink-0 ${inset ? 'px-3.5 pb-2' : ''}`}>{footer}</div>
    </div> : children}
  </MessageFooterContext.Provider>
}
