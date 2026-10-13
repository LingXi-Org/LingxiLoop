import type { ReactNode } from 'react'
import { ToolGroupRoot, ToolGroupTrigger, ToolGroupContent } from './tool-group-primitives'

export function ToolGroup({ count, active, children }: { count: number; active: boolean; children: ReactNode }) {
  return <ToolGroupRoot><ToolGroupTrigger count={count} active={active} /><ToolGroupContent>{children}</ToolGroupContent></ToolGroupRoot>
}
