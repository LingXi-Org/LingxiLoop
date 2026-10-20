import { useEffect, useRef } from 'react'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { getActiveCompanyId, useAuth } from '@/stores/auth'
import type { CanvasFrame } from '../contracts'
import { useCanvas } from '../state'

/** A staged reference/send belongs to one live dialog and its original scope. */
export function useCanvasFeedbackScope(frame: CanvasFrame, onClose: () => void) {
  const captured = useRef({
    userId: useAuth.getState().user?.id ?? null,
    companyId: getActiveCompanyId(), workspace: getWorkspaceSession(),
    canvasId: frame.canvasId, frameId: frame.id,
  }).current
  const close = useRef(onClose)
  close.current = onClose
  const lifetime = useRef<AbortController | null>(null)
  const matches = () => {
    const workspace = getWorkspaceSession()
    const canvas = useCanvas.getState()
    return captured.userId === (useAuth.getState().user?.id ?? null)
      && captured.companyId === getActiveCompanyId()
      && captured.workspace?.companyId === workspace?.companyId
      && captured.workspace?.projectId === workspace?.projectId
      && canvas.activeCanvasId === captured.canvasId && canvas.snapshot?.id === captured.canvasId
      && canvas.snapshot.frames.some(value => value.id === captured.frameId)
  }
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    const invalidate = () => {
      if (!controller.signal.aborted && !matches()) { controller.abort(); close.current() }
    }
    const unsubscribeAuth = useAuth.subscribe(invalidate)
    const unsubscribeCanvas = useCanvas.subscribe(invalidate)
    window.addEventListener('lingxiloop-workspace-changed', invalidate)
    invalidate()
    return () => {
      controller.abort()
      unsubscribeAuth(); unsubscribeCanvas()
      window.removeEventListener('lingxiloop-workspace-changed', invalidate)
    }
  }, [captured])
  const beginSend = () => {
    const controller = lifetime.current
    const assertCurrent = () => {
      // Controller identity is the dialog generation, so even an A→B→A change
      // or StrictMode re-mount cannot revive a previous request continuation.
      if (!controller || controller !== lifetime.current || controller.signal.aborted || !matches()) {
        throw new Error('画布反馈已关闭或工作区已改变，请重新确认后发送。')
      }
    }
    assertCurrent()
    return { ...captured, signal: controller!.signal, assertCurrent }
  }
  return { beginSend, cancel: () => { lifetime.current?.abort(); close.current() } }
}
