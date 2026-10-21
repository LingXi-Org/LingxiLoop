import { readFileSync } from 'node:fs'
import { z } from 'zod'

export const slidingWindowSchema = z.object({
  title: z.string().trim().min(1).max(200),
  packetCount: z.number().int().min(2).max(60),
  windowSize: z.number().int().min(1).max(12),
}).strict()
export class SlidingWindowInputError extends Error {}
const geometry = readFileSync(new URL('../../assets/visualize-range.js', import.meta.url), 'utf8')
const interaction = readFileSync(new URL('../../assets/visualize-sliding-window.js', import.meta.url), 'utf8')
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

/** A bounded teaching simulation, not a TCP implementation or a historical HTML repair. */
export function renderSlidingWindow(input: unknown, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const config = slidingWindowSchema.parse(input)
  if (config.windowSize > config.packetCount) throw new SlidingWindowInputError('Window size exceeds packet count')
  const html = `<script>${geometry}</script><style>
.lx-window{font:14px/1.5 system-ui;color:var(--foreground,#222);width:100%;box-sizing:border-box}
.lx-window h3{overflow-wrap:anywhere}.lx-window-controls{display:flex;align-items:center;flex-wrap:wrap;gap:.75rem;margin-bottom:1rem}
.lx-window-controls label{display:flex;align-items:center;gap:.5rem}.lx-window-controls input{width:8rem}
.lx-window-scroll{overflow-x:auto;padding:4px}.lx-window-row{position:relative;display:flex;gap:.5rem;padding:0;isolation:isolate}
.lx-window [data-packet]{box-sizing:border-box;flex:1 0 2.5em;min-width:0;text-align:center;padding:1em .25em;border:1px solid var(--border,#bbb);border-radius:.4rem}
.lx-window [data-packet-state=ready]{background:var(--background,#fff)}.lx-window [data-packet-state=waiting]{background:var(--muted,#eee);color:var(--muted-foreground,#777)}
.lx-window [data-packet-state=acked]{background:#b8d9bf;color:#173e23}.lx-window [data-packet-state=inflight]{background:#f0c5a8;color:#4e2b16}
.lx-window [data-window-outline]{border:2px solid #3775df;border-radius:.4rem;z-index:1}.lx-window [data-window-outline][hidden]{display:none}
.lx-window p{margin:.7rem 0;overflow-wrap:anywhere}.lx-window [data-window-range]{color:var(--foreground,#222)}
</style><section class="lx-window" aria-label="${escapeHtml(config.title)}"><h3>${escapeHtml(config.title)}</h3>
<script type="application/json" data-window-config>${JSON.stringify(config).replaceAll('<', '\\u003c')}</script>
<div class="lx-window-controls"><label>窗口大小 <input type="range" aria-label="窗口大小" min="1" max="${Math.min(12, config.packetCount)}" value="${config.windowSize}"><output data-window-size>${config.windowSize}</output></label><button class="btn" type="button" data-window-next>下一步</button><button class="btn" type="button" data-window-play aria-pressed="false">自动播放</button><button class="btn" type="button" data-window-reset>重置</button></div>
<div class="lx-window-scroll"><div class="lx-window-row" data-window-row>${Array.from({ length: config.packetCount }, (_, i) => `<span data-packet="${i}">${i}</span>`).join('')}<div data-window-outline aria-hidden="true" hidden></div></div></div>
<p data-window-range role="status"></p><p data-window-phase></p><p>绿色：已确认 · 橙色：已发送未确认 · 蓝框内：当前窗口 · 灰色：窗口外等待</p><p>改变窗口大小会重置演示。本演示按窗口批量发送、确认，不模拟丢包或重传。</p></section><script>${interaction}</script>`
  signal?.throwIfAborted()
  return { html, summary: { kind: 'sliding-window' as const, packetCount: config.packetCount, windowSize: config.windowSize, initialRange: [0, config.windowSize - 1], geometry: 'measured-dom-range' as const } }
}
