import { useEffect, useState } from 'react'
import { api, getPairingServerOrigin } from '@/api/client'
import { useComputers } from '@/stores/computers'
import { isWindows } from '@/lib/runtime'
import { TitleBar } from '@/desktop/TitleBar'

/**
 * First-run gate for free-tier users: their agents run on their own machine
 * (BYOA), so before they can use Cumora they must pair a computer. Once any
 * non-cloud computer comes online, the parent (AuthedApp) clears this gate
 * automatically — there's no explicit "done" button, the WS status event does
 * it. Starter agents are seeded server-side onto that computer at pair time.
 */
export function Onboarding() {
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // The engine the starter team (and agents later assigned here) will run on.
  // Claude is the default; picking Codex appends `--engine codex`. We DON'T
  // append `--engine claude` so a Codex-only machine still auto-detects rather
  // than erroring on a Claude it doesn't have.
  const [engine, setEngine] = useState<'claude' | 'codex'>('claude')
  // Default to installing the always-on service: it auto-starts on boot,
  // auto-restarts on crash, and auto-updates — so the user isn't tied to a
  // terminal that must stay open. Appends `--install-service` to the command.
  // `--install-service` only supports macOS + Linux (the daemon throws on
  // Windows), so default it off there and hide the option entirely.
  const [asService, setAsService] = useState(!isWindows)

  useEffect(() => { void useComputers.getState().refresh() }, [])
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(t)
  }, [copied])

  const origin = getPairingServerOrigin()
  const engineFlag = engine === 'codex' ? ' --engine codex' : ''
  const serviceFlag = asService ? ' --install-service' : ''
  const cmd = code ? `npx cumora@latest agent computer --pair ${code}${origin ? ` --server ${origin}` : ''}${engineFlag}${serviceFlag}` : ''

  async function getCode() {
    setErr(null); setBusy(true)
    try { setCode((await api.requestPairingCode()).code) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    // TitleBar carries the window drag region (and traffic-light spacing) — the
    // onboarding screen replaces the whole app, so without it the window can't
    // be dragged. Outer flex-col + h-screen makes the content fill the window.
    <div className="flex flex-col h-screen">
      <TitleBar />
      <main className="flex-1 overflow-y-auto grid place-items-center p-8"
        style={{ background: 'linear-gradient(180deg, var(--paper), var(--sky-50))' }}>
        <div className="w-full max-w-[640px]">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[34px] leading-none">💻</span>
            <h1 className="font-display font-medium text-[32px] tracking-tight text-ink-900" style={{ letterSpacing: '-0.02em' }}>
              设置您的计算机
            </h1>
          </div>
          <p className="text-[14.5px] text-ink-600 leading-relaxed mb-6 max-w-[560px]">
            您的智能体运行在 <strong>你自己的机器</strong> （或 VPS），由您本地提供
            <span className="font-mono text-[13px]"> 克劳德代码</span> 或
            <span className="font-mono text-[13px]"> 法典</span>。配对计算机即可开始 —
            您的入门团队将在那里组建，每个团队都有自己独立的工作空间、内存和技能。
          </p>

          <div className="bg-cloud rounded-[16px] p-5" style={{ border: '1px solid var(--ink-100)' }}>
            {!code ? (
              <>
                <div className="text-[13px] text-ink-600 mb-4">
                  在您想要托管智能体的计算机上，您将运行一个命令。它需要
                  <span className="font-mono"> 克劳德</span> 或 <span className="font-mono">法典</span> 已安装。
                </div>
                {err && <div className="text-[12px] text-coral-deep bg-coral-soft rounded-[8px] p-2 mb-3">{err}</div>}
                <button onClick={getCode} disabled={busy}
                  className="px-5 py-2.5 rounded-[11px] bg-skype text-white text-[14px] font-semibold disabled:opacity-50">
                  {busy ? "正在生成..." : "添加计算机"}
                </button>
              </>
            ) : (
              <>
                <div className="text-[13px] font-semibold text-ink-900 mb-1">在该机器上运行：</div>
                <div className="text-[11.5px] text-ink-500 mb-2.5 italic font-display">
                  此配对令牌保持有效。计算机出现在此处，连接后您将自动继续。
                </div>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className="text-[12px] text-ink-500">发动机</span>
                  <div className="inline-flex rounded-[9px] p-0.5" style={{ background: 'var(--ink-100)' }}>
                    {([['claude', 'Claude Code'], ['codex', 'Codex']] as const).map(([id, label]) => (
                      <button key={id} type="button" onClick={() => setEngine(id)}
                        className="px-3 py-1 rounded-[7px] text-[12px] font-semibold transition-colors duration-150"
                        style={engine === id
                          ? { background: 'var(--paper)', color: 'var(--ink-900)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
                          : { color: 'var(--ink-500)' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] text-ink-400">只是默认值 - 该计算机仍然可以在任一引擎上运行智能体</span>
                </div>
                {isWindows ? (
                  <div className="mb-2.5 text-[12px] text-ink-600">
                    在智能体运行时保持此终端打开。
                    <span className="text-ink-400"> — Windows 尚不支持后台服务安装。</span>
                  </div>
                ) : (
                  <label className="flex items-start gap-2 mb-2.5 cursor-pointer select-none">
                    <input type="checkbox" checked={asService} onChange={(e) => setAsService(e.target.checked)} className="mt-[3px]" />
                    <span className="text-[12px] text-ink-600">
                      让它在后台运行 <span className="text-ink-400">— 启动时自动启动、崩溃时自动重启、自动更新。否则该终端必须保持打开状态。</span>
                    </span>
                  </label>
                )}
                <pre className="bg-ink-900 text-cloud rounded-[10px] p-3 text-[12px] overflow-x-auto whitespace-pre-wrap break-all font-mono select-all">{cmd}</pre>
                <div className="flex items-center gap-3 mt-3">
                  <button onClick={() => { void navigator.clipboard?.writeText(cmd); setCopied(true) }}
                    className="inline-flex items-center justify-center min-w-[120px] text-[12px] font-semibold px-3 py-1.5 rounded-[9px] text-white transition-colors duration-200"
                    style={{ background: copied ? '#3BB273' : 'var(--skype)' }}>
                    {copied ? "✓ 已复制！" : "复制命令"}
                  </button>
                  <span className="inline-flex items-center gap-2 text-[12px] text-ink-500">
                    <span className="w-2 h-2 rounded-full bg-ink-300 animate-pulse" />
                    正在等待您的计算机连接...
                  </span>
                </div>
              </>
            )}
          </div>

          <p className="text-[12px] text-ink-400 mt-4">
            想要托管云智能体吗？ <span className="text-skype-deep">升级到专业版</span> 在 LingxiLoop 云上运行智能体。
          </p>
        </div>
      </main>
    </div>
  )
}
