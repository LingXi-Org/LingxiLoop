/** Shared result shape for internal, server-owned learning actions.
 * The model-visible tool definition lives in the vendored LingxiOS runtime. */
export interface ToolResult {
  ok: boolean
  output: unknown
  display: { name: string; arg: string; status: string; detail: string; icon?: 'web' | 'github' | 'figma' | 'db' }
  error?: string
  durationMs: number
  aborted?: boolean
}
