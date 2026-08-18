/**
 * Git-short-SHA-style resolution for artifact ids.
 *
 * Agents sometimes hand back a TRUNCATED artifact id (e.g. `ce-d53fa1f5`
 * instead of the full `ce-d53fa1f5-ed14-447e-bb3b-fd614a07cd40`) — typically
 * the abbreviated form shown in a list view. Exactly like `git show <short>`,
 * we resolve such a prefix to the real id IF it unambiguously matches one
 * known artifact in this workspace; otherwise we leave it untouched (no match
 * or an ambiguous prefix both keep the original, so we never guess wrong).
 *
 * Calendar / document / board stores hold the FULL workspace list, so their
 * prefix resolution is reliable. Cards are only loaded per opened board, so
 * `useResolvedCardId` is best-effort against in-memory board snapshots.
 */
import { useEffect, useMemo } from 'react'
import { useCalendar } from '@/stores/calendar'
import { useDocuments } from '@/stores/documents'
import { useBoards } from '@/stores/boards'

/** If `id` is an unambiguous prefix of exactly one item's id, return that full
 *  id; otherwise return `id` unchanged. Exact match always wins. */
export function resolveIdPrefix<T>(id: string, items: readonly T[], getId: (t: T) => string): string {
  let match: string | null = null
  for (const it of items) {
    const full = getId(it)
    if (full === id) return id // exact match wins outright
    if (full.length > id.length && full.startsWith(id)) {
      if (match !== null && match !== full) return id // ambiguous → don't guess
      match = full
    }
  }
  return match ?? id
}

export function useResolvedCalendarId(id: string): string {
  const events = useCalendar((s) => s.events)
  const loaded = useCalendar((s) => s.loaded)
  const load = useCalendar((s) => s.load)
  useEffect(() => { if (!loaded) void load() }, [loaded, load])
  return useMemo(() => resolveIdPrefix(id, events, (e) => e.id), [id, events])
}

export function useResolvedDocumentId(id: string): string {
  const list = useDocuments((s) => s.list)
  const loaded = useDocuments((s) => s.loaded)
  const load = useDocuments((s) => s.load)
  useEffect(() => { if (!loaded) void load() }, [loaded, load])
  return useMemo(() => resolveIdPrefix(id, list, (d) => d.id), [id, list])
}

export function useResolvedBoardId(id: string): string {
  const list = useBoards((s) => s.list)
  const loadingList = useBoards((s) => s.loadingList)
  const loadList = useBoards((s) => s.loadList)
  useEffect(() => { if (list.length === 0 && !loadingList) void loadList() }, [list.length, loadingList, loadList])
  return useMemo(() => resolveIdPrefix(id, list, (b) => b.id), [id, list])
}

export function useResolvedCardId(id: string): string {
  // Cards aren't loaded workspace-wide (only per opened board), so this is a
  // best-effort match against board snapshots already in memory — it falls back
  // to the original id when the card's board hasn't been opened.
  const snapshots = useBoards((s) => s.snapshots)
  return useMemo(
    () => resolveIdPrefix(id, Object.values(snapshots).flatMap((s) => s.cards), (c) => c.id),
    [id, snapshots],
  )
}
