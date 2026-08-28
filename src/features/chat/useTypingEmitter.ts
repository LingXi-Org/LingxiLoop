import { useCallback, useEffect, useRef } from 'react'
import { conversationsApi } from '@/features/conversations/api'

export function useTypingEmitter(conversationId: string, text: string) {
  const stateRef = useRef<{ conversationId: string; lastSentAt: number } | null>(null)
  const idleTimerRef = useRef<number | null>(null)

  const clearIdle = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  const emit = useCallback((targetConversationId: string, done: boolean) => {
    void conversationsApi.emitTyping(targetConversationId, done).catch((error) => {
      console.warn('[typing] emit failed', error)
    })
  }, [])

  const finalize = useCallback(() => {
    clearIdle()
    const current = stateRef.current
    if (current) {
      emit(current.conversationId, true)
      stateRef.current = null
    }
  }, [clearIdle, emit])

  useEffect(() => {
    const trimmed = text.trim()
    if (!trimmed) {
      finalize()
      return
    }
    const now = Date.now()
    const current = stateRef.current
    if (!current || current.conversationId !== conversationId) {
      if (current) emit(current.conversationId, true)
      emit(conversationId, false)
      stateRef.current = { conversationId, lastSentAt: now }
    } else if (now - current.lastSentAt > 3000) {
      emit(conversationId, false)
      current.lastSentAt = now
    }
    clearIdle()
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null
      const live = stateRef.current
      if (live) {
        emit(live.conversationId, true)
        stateRef.current = null
      }
    }, 2000)
  }, [text, conversationId, emit, clearIdle, finalize])

  useEffect(() => () => finalize(), [finalize])

  return finalize
}
