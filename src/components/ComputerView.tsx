import { useEffect, useMemo, useRef, useState } from 'react'
import { type ApiAgentScreen, type ApiUserComputer, api } from '@/api/client'
import { IComputer, IPlus } from '@/components/icons'
import { useParticipants } from '@/stores/participants'

const STATUS_LABEL: Record<ApiUserComputer['status'], string> = {
  stopped: '已停止', starting: '启动中', running: '运行中', stopping: '停止中', error: '需要检查',
}

const SCREEN_STATUS: Record<ApiAgentScreen['status'], string> = {
  idle: '空闲', working: '工作中', waiting: '等待你', human_control: '由你控制',
}

export function ComputerView() {
  const [computer, setComputer] = useState<ApiUserComputer | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addAgentId, setAddAgentId] = useState('')
  const [screenUrl, setScreenUrl] = useState<string | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [inputText, setInputText] = useState('')
  const screenUrlRef = useRef<string | null>(null)
  const participants = useParticipants((s) => s.byId)
  const agents = useMemo(() => Object.values(participants).filter((p) => p.kind === 'agent' && !p.departedAt), [participants])

  const load = async () => {
    try {
      const next = await api.getUserComputer()
      setComputer(next)
      setSelectedId((current) => current && next.screens.some((s) => s.id === current) ? current : next.screens[0]?.id ?? null)
      setError(null)
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  useEffect(() => { void load() }, [])

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key); setError(null)
    try { await action(); await load() }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setBusy(null) }
  }

  const selected = computer?.screens.find((screen) => screen.id === selectedId) ?? null
  const unassigned = agents.filter((agent) => !computer?.screens.some((screen) => screen.agentId === agent.id))

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const replaceUrl = (next: string | null) => {
      if (screenUrlRef.current) URL.revokeObjectURL(screenUrlRef.current)
      screenUrlRef.current = next
      if (!cancelled) setScreenUrl(next)
    }
    replaceUrl(null)
    if (!selectedId || computer?.status !== 'running') {
      return () => { cancelled = true }
    }
    const refresh = async () => {
      try {
        const blob = await api.getComputerScreenScreenshot(selectedId)
        if (!cancelled) {
          replaceUrl(URL.createObjectURL(blob))
          setStreamError(null)
        }
      } catch (err) {
        if (!cancelled) setStreamError(err instanceof Error ? err.message : String(err))
      }
    }
    const runStream = async () => {
      try {
        await api.streamComputerScreen(selectedId, (blob, status) => {
          if (cancelled) return
          replaceUrl(URL.createObjectURL(blob))
          setStreamError(null)
          setComputer((current) => current ? {
            ...current,
            screens: current.screens.map((screen) => screen.id === selectedId ? { ...screen, status } : screen),
          } : current)
        }, controller.signal)
      } catch (err) {
        if (cancelled || controller.signal.aborted) return
        setStreamError(err instanceof Error ? `${err.message}；已切换为低频刷新` : String(err))
        while (!cancelled) {
          await refresh()
          await new Promise((resolve) => window.setTimeout(resolve,
            selected?.status === 'working' || selected?.status === 'human_control' ? 1_000 : 8_000))
        }
      }
    }
    void runStream()
    return () => {
      cancelled = true
      controller.abort()
      replaceUrl(null)
    }
  }, [selectedId, computer?.status, selected?.status])

  useEffect(() => {
    if (!selected || selected.status !== 'human_control') return
    const heartbeat = () => void api.heartbeatScreenControl(selected.id).catch((err) => {
      setStreamError(err instanceof Error ? err.message : String(err))
      void load()
    })
    heartbeat()
    const timer = window.setInterval(heartbeat, 45_000)
    return () => window.clearInterval(timer)
  }, [selected?.id, selected?.status])

  const sendInput = async (input: Parameters<typeof api.sendComputerScreenInput>[1]) => {
    if (!selected) return false
    try {
      await api.sendComputerScreenInput(selected.id, input)
      setStreamError(null)
      return true
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : String(err))
      return false
    }
  }

  return (
    <main className="h-full overflow-y-auto bg-app px-5 py-5 md:px-8 md:py-7">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-raised text-accent"><IComputer className="size-5" /></div>
          <div>
            <h1 className="text-[20px] font-semibold text-ink">我的 Computer</h1>
            <p className="text-[12px] text-ink-secondary">所有 Agent 共享文件、应用与登录状态，并在各自 Screen 并行工作。</p>
          </div>
          {computer && (
            <div className="ml-auto flex items-center gap-2">
              <span className={`size-2 rounded-full ${computer.status === 'running' ? 'bg-avail' : computer.status === 'error' ? 'bg-coral' : 'bg-ink-200'}`} />
              <span className="text-[12px] font-semibold text-ink-secondary">{STATUS_LABEL[computer.status]}</span>
              {computer.status === 'running' ? (
                <button type="button" disabled={busy !== null} onClick={() => void run('stop', api.stopUserComputer)} className="ml-2 rounded-lg border border-hairline px-3 py-1.5 text-[12px] font-semibold text-ink-secondary hover:bg-raised disabled:opacity-50">停止</button>
              ) : (
                <button type="button" disabled={busy !== null} onClick={() => void run('start', api.startUserComputer)} className="ml-2 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50">{busy === 'start' ? '启动中…' : '启动'}</button>
              )}
            </div>
          )}
        </header>

        {error && <div className="mt-4 rounded-xl border border-coral/30 bg-coral-soft/30 px-4 py-3 text-[12px] text-coral-deep">{error}</div>}

        {!computer ? (
          <div className="mt-8 rounded-2xl border border-hairline bg-panel p-8 text-center text-[13px] text-ink-400">正在准备你的持久化 Computer…</div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-hairline bg-panel p-3">
              <div className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-300">Screens</div>
              <div className="space-y-1">
                {computer.screens.map((screen) => (
                  <button key={screen.id} type="button" onClick={() => setSelectedId(screen.id)} className={`w-full rounded-xl px-3 py-2.5 text-left transition ${selectedId === screen.id ? 'bg-raised text-accent' : 'text-ink-secondary hover:bg-raised'}`}>
                    <div className="text-[13px] font-semibold">{screen.agentName}</div>
                    <div className="mt-0.5 text-[10.5px] opacity-70">{SCREEN_STATUS[screen.status]}</div>
                  </button>
                ))}
                {computer.screens.length === 0 && <div className="px-3 py-5 text-center text-[11px] text-ink-300">尚无 Agent Screen</div>}
              </div>
              {unassigned.length > 0 && (
                <div className="mt-3 border-t border-hairline pt-3">
                  <select value={addAgentId} onChange={(event) => setAddAgentId(event.target.value)} className="h-9 w-full rounded-lg border border-hairline bg-inset px-2 text-[12px] text-ink-secondary">
                    <option value="">选择 Agent…</option>
                    {unassigned.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </select>
                  <button type="button" disabled={!addAgentId || busy !== null} onClick={() => void run('screen', () => api.createComputerScreen(addAgentId))} className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-hairline text-[12px] font-semibold text-ink-secondary hover:bg-raised disabled:opacity-40"><IPlus className="size-3.5" />添加 Screen</button>
                </div>
              )}
            </aside>

            <section className="min-w-0 overflow-hidden rounded-2xl border border-hairline bg-panel">
              {selected ? (
                <>
                  <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
                    <div>
                      <div className="text-[14px] font-semibold text-ink">{selected.agentName} Screen</div>
                      <div className="text-[10.5px] text-ink-400">{SCREEN_STATUS[selected.status]}{selected.controller ? ` · ${selected.controller.type === 'human' ? '你正在控制' : `${selected.agentName} 正在控制`}` : ''}</div>
                    </div>
                    <div className="ml-auto">
                      {selected.status === 'human_control' ? (
                        <button type="button" disabled={busy !== null} onClick={() => void run('return', () => api.returnScreenToAgent(selected.id))} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink disabled:opacity-50">交还给 {selected.agentName}</button>
                      ) : (
                        <button type="button" disabled={busy !== null} onClick={() => void run('takeover', () => api.takeOverScreen(selected.id))} className="rounded-lg border border-hairline px-3 py-1.5 text-[12px] font-semibold text-ink-secondary hover:bg-raised disabled:opacity-50">接管控制</button>
                      )}
                    </div>
                  </div>
                  <div className="grid min-h-[420px] place-items-center bg-[radial-gradient(circle_at_center,rgba(68,139,220,0.08),transparent_62%)] p-4">
                    {screenUrl ? (
                      <div className="w-full">
                        <img
                          src={screenUrl}
                          alt={`${selected.agentName} desktop`}
                          onClick={(event) => {
                            if (selected.status !== 'human_control') return
                            const rect = event.currentTarget.getBoundingClientRect()
                            const x = ((event.clientX - rect.left) / rect.width) * event.currentTarget.naturalWidth
                            const y = ((event.clientY - rect.top) / rect.height) * event.currentTarget.naturalHeight
                            void sendInput({ type: 'click', x, y })
                          }}
                          className={`max-h-[680px] w-full rounded-lg border border-hairline bg-inset object-contain shadow-sm ${selected.status === 'human_control' ? 'cursor-crosshair' : ''}`}
                        />
                        {selected.status === 'human_control' && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-inset p-2">
                            <input
                              value={inputText}
                              onChange={(event) => setInputText(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && inputText) {
                                  event.preventDefault()
                                  void sendInput({ type: 'text', text: inputText }).then((sent) => { if (sent) setInputText('') })
                                }
                              }}
                              placeholder="输入到当前 Screen…"
                              className="h-9 min-w-[220px] flex-1 rounded-lg border border-hairline bg-panel px-3 text-[12px] text-ink outline-none focus:border-accent"
                            />
                            <button type="button" disabled={!inputText} onClick={() => void sendInput({ type: 'text', text: inputText }).then((sent) => { if (sent) setInputText('') })} className="h-9 rounded-lg bg-accent px-3 text-[11.5px] font-semibold text-accent-ink disabled:opacity-40">输入文字</button>
                            {(['Return', 'Tab', 'Escape'] as const).map((key) => (
                              <button key={key} type="button" onClick={() => void sendInput({ type: 'key', key })} className="h-9 rounded-lg border border-hairline px-3 text-[11.5px] font-semibold text-ink-secondary hover:bg-raised">
                                {key === 'Return' ? 'Enter' : key === 'Escape' ? 'Esc' : key}
                              </button>
                            ))}
                          </div>
                        )}
                        {streamError && <p className="mt-2 text-center text-[11px] text-coral-deep">{streamError}</p>}
                      </div>
                    ) : (
                      <div className="max-w-md text-center">
                        <IComputer className="mx-auto size-12 text-ink-200" />
                        <div className="mt-4 text-[14px] font-semibold text-ink-secondary">{computer.status === 'running' ? '正在连接 Screen…' : '启动 Computer 以查看 Screen'}</div>
                        <p className="mt-2 text-[12px] leading-5 text-ink-400">桌面画面通过认证 Computer Gateway 刷新；内部端口、显示号和运行时凭据不会暴露给客户端。</p>
                        {streamError && <p className="mt-2 text-[11px] text-coral-deep">{streamError}</p>}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="grid min-h-[480px] place-items-center px-8 text-center text-[13px] text-ink-400">为一个 Agent 添加 Screen 后，可在这里查看并单独接管。</div>
              )}
            </section>
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ['共享工作区', '/workspace 与 /home/lingxi 在重启后保留'],
            ['独立控制', '接管一个 Screen 不会暂停其他 Agent'],
            ['共享登录', '浏览器服务复用用户级持久化 profile'],
          ].map(([title, detail]) => <div key={title} className="rounded-xl border border-hairline bg-panel px-4 py-3"><div className="text-[12px] font-semibold text-ink">{title}</div><div className="mt-1 text-[10.5px] text-ink-secondary">{detail}</div></div>)}
        </div>
      </div>
    </main>
  )
}
