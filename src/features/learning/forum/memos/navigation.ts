// Adapted from usememos/memos components/MemoView/navigation.ts at
// 8120a6cee03003ee7968b49b2109f816fa4d96a4 (MIT; see LICENSE).
export interface MemoNavigationState { from: string }
export const createMemoNavigationState = (from: string): MemoNavigationState => ({ from })
/** Reads the origin from router state; a direct detail returns to its course feed. */
export const resolveMemoDetailOrigin = (state: unknown, courseFeed: string): string => {
  const value = state && typeof state === 'object' ? (state as { from?: unknown }) : undefined
  const explicitParentPage = typeof value?.from === 'string' ? value.from : undefined
  return explicitParentPage || courseFeed
}
