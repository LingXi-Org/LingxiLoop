// Adapted from Memos useAutoSave/cacheService lifecycle: debounce, pagehide and unmount flush.
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { useAuth } from '@/stores/auth'

export const contentDraftSchema = z.object({ body: z.string().max(20000), links: z.string().max(42000),
  attachments: z.array(z.object({ key: z.string().max(1024), name: z.string().max(255) }).strict()).max(20) }).strict()
export const composerDraftSchema = contentDraftSchema.extend({ title: z.string().max(200), tags: z.string().max(1000),
  kind: z.enum(['share', 'resource', 'case']), sourceId: z.string().max(200) })
export const emptyContent = { body: '', links: '', attachments: [] }

export function useForumDraft<T>(scope: string, schema: z.ZodType<T>, initial: T) {
  const userId = useAuth(state => state.user?.id), companyId = useAuth(state => state.activeCompanyId)
  const key = `lingxiloop.forum.draft:${companyId}:${userId}:${scope}`
  const read = (): T => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as { updatedAt?: unknown; value?: unknown } | null
      if (typeof saved?.updatedAt !== 'number' || Date.now() - saved.updatedAt > 7 * 86400000) return initial
      const parsed = schema.safeParse(saved.value)
      return parsed.success ? parsed.data : initial
    } catch { return initial }
  }
  const [record, setRecord] = useState(() => ({ key, value: read() }))
  if (record.key !== key) setRecord({ key, value: read() })
  const latest = useRef(record), discarded = useRef(false)
  latest.current = record
  const setDraft = useCallback((next: T | ((previous: T) => T)) => {
    discarded.current = false
    setRecord(previous => ({ key: previous.key, value: typeof next === 'function' ? (next as (value: T) => T)(previous.value) : next }))
  }, [])
  const [storageError, setStorageError] = useState(false)
  const persist = useCallback(() => {
    if (discarded.current) return
    try {
      const savedDrafts: { key: string; updatedAt: number }[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const savedKey = localStorage.key(i)
        if (!savedKey?.startsWith('lingxiloop.forum.draft:')) continue
        try {
          const saved = JSON.parse(localStorage.getItem(savedKey) ?? 'null') as { updatedAt?: unknown } | null
          savedDrafts.push({ key: savedKey, updatedAt: typeof saved?.updatedAt === 'number' ? saved.updatedAt : 0 })
        } catch { savedDrafts.push({ key: savedKey, updatedAt: 0 }) }
      }
      savedDrafts.filter(saved => saved.key !== latest.current.key).sort((a, b) => b.updatedAt - a.updatedAt)
        .forEach((saved, index) => { if (index >= 19 || Date.now() - saved.updatedAt > 7 * 86400000) localStorage.removeItem(saved.key) })
      localStorage.setItem(latest.current.key, JSON.stringify({ updatedAt: Date.now(), value: latest.current.value }))
      setStorageError(false)
    } catch { setStorageError(true) }
  }, [])
  useEffect(() => { const timer = setTimeout(persist, 300); return () => clearTimeout(timer) }, [record, persist])
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') persist() }
    window.addEventListener('pagehide', persist); document.addEventListener('visibilitychange', hide)
    return () => { persist(); window.removeEventListener('pagehide', persist); document.removeEventListener('visibilitychange', hide) }
  }, [persist])
  const discard = useCallback(() => {
    discarded.current = true
    try { localStorage.removeItem(latest.current.key) } catch { setStorageError(true) }
  }, [])
  return { draft: record.value, setDraft, discard, storageError }
}
