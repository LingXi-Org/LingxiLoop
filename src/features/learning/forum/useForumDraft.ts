// Adapted from Memos useAutoSave/cacheService lifecycle: debounce, pagehide and unmount flush.
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { useAuth } from '@/stores/auth'

export const contentDraftSchema = z.object({ body: z.string().max(20000), links: z.string().max(42000),
  attachments: z.array(z.object({ key: z.string().max(1024), name: z.string().max(255) }).strict()).max(20) }).strict()
export const composerDraftSchema = contentDraftSchema.extend({ title: z.string().max(200), tags: z.string().max(1000),
  sourceId: z.string().max(200), dueAt: z.string().max(40) })
export const emptyContent = { body: '', links: '', attachments: [] }

export function useForumDraft<T extends { body: string; links: string; attachments: unknown[]; title?: string; tags?: string; sourceId?: string }>(scope: string, schema: z.ZodType<T>, initial: T, enabled = true) {
  const userId = useAuth(state => state.user?.id), companyId = useAuth(state => state.activeCompanyId)
  const prefix = `lingxiloop.forum.draft:${companyId}:${userId}:`, key = `${prefix}${scope}`
  const read = (): T => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as { updatedAt?: unknown; value?: unknown } | null
      if (typeof saved?.updatedAt !== 'number' || Date.now() - saved.updatedAt > 7 * 86400000) return initial
      const parsed = schema.safeParse(saved.value)
      return parsed.success ? parsed.data : initial
    } catch { return initial }
  }
  const [record, setRecord] = useState(() => ({ key, value: read(), dirty: false }))
  if (record.key !== key) setRecord({ key, value: read(), dirty: false })
  const latest = useRef({ record, prefix, enabled }), discarded = useRef(false), lastSaved = useRef<string | null>(null)
  latest.current = { record, prefix, enabled: enabled && Boolean(userId && companyId) }
  const [storageError, setStorageError] = useState(false)
  const persist = useCallback(() => {
    const { record: current, prefix: currentPrefix, enabled: canSave } = latest.current
    if (discarded.current || !canSave || !current.dirty) return
    const serialized = JSON.stringify(current.value), fingerprint = `${current.key}:${serialized}`
    if (lastSaved.current === fingerprint) return
    try {
      const value = current.value
      if (!value.body.trim() && !value.links.trim() && !value.attachments.length && !value.title?.trim() && !value.tags?.trim()
        && (!value.sourceId || value.sourceId === 'none')) {
        localStorage.removeItem(current.key)
        lastSaved.current = fingerprint
        setStorageError(false)
        return
      }
      const savedDrafts: { key: string; updatedAt: number }[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const savedKey = localStorage.key(i)
        if (!savedKey?.startsWith(currentPrefix)) continue
        try {
          const saved = JSON.parse(localStorage.getItem(savedKey) ?? 'null') as { updatedAt?: unknown } | null
          savedDrafts.push({ key: savedKey, updatedAt: typeof saved?.updatedAt === 'number' ? saved.updatedAt : 0 })
        } catch { savedDrafts.push({ key: savedKey, updatedAt: 0 }) }
      }
      savedDrafts.filter(saved => saved.key !== current.key).sort((a, b) => b.updatedAt - a.updatedAt)
        .forEach((saved, index) => { if (index >= 19 || Date.now() - saved.updatedAt > 7 * 86400000) localStorage.removeItem(saved.key) })
      localStorage.setItem(current.key, JSON.stringify({ updatedAt: Date.now(), value: current.value }))
      lastSaved.current = fingerprint
      setStorageError(false)
    } catch { setStorageError(true) }
  }, [])
  const mounted = useRef(true)
  const setDraft = useCallback((next: T | ((previous: T) => T)) => {
    discarded.current = false
    const previous = latest.current.record
    const record = { key: previous.key, value: typeof next === 'function' ? (next as (value:T)=>T)(previous.value) : next, dirty:true }
    latest.current = {...latest.current,record}
    if(mounted.current) setRecord(record)
    else persist()
  },[persist])
  useEffect(() => { const timer = setTimeout(persist, 300); return () => clearTimeout(timer) }, [record, persist])
  useEffect(() => {
    mounted.current=true
    const hide = () => { if (document.visibilityState === 'hidden') persist() }
    window.addEventListener('pagehide', persist); document.addEventListener('visibilitychange', hide)
    return () => { mounted.current=false; persist(); window.removeEventListener('pagehide', persist); document.removeEventListener('visibilitychange', hide) }
  }, [persist])
  const discard = useCallback(() => {
    discarded.current = true
    lastSaved.current = null
    if (!latest.current.enabled) return
    try { localStorage.removeItem(latest.current.record.key) } catch { setStorageError(true) }
  }, [])
  return { draft: record.value, setDraft, discard, storageError }
}
