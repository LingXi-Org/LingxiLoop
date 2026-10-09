import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { dctImage, functionPlot, montyHallGame, projectile } from '@/lib/interactive-ui/kernels'
import type { ScienceRequest, ScienceResult } from './science-worker'

const number = (value: number) => value !== 0 && Math.abs(value) < .0001 ? value.toExponential(3) : new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 6 }).format(value)
const colors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)']

export function ProjectilePlot(props: Parameters<typeof projectile>[0]) {
  const result = useMemo(() => projectile(props), [props.angle, props.speed, props.gravity, props.height, props.samples])
  return <figure className="grid min-w-0 gap-2" aria-label="抛射轨迹">
    <ChartContainer className="h-56 w-full min-w-0" config={{ y: { label: '高度 (m)', color: colors[0] } }}>
      <LineChart data={result.points} margin={{ top: 8, right: 12, bottom: 18, left: 0 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="x" type="number" tickFormatter={number} label={{ value: '水平距离 (m)', position: 'insideBottom', offset: -12 }} />
        <YAxis dataKey="y" type="number" width={48} tickFormatter={number} /><ChartTooltip content={<ChartTooltipContent />} />
        <Line dataKey="y" type="linear" dot={false} stroke={colors[0]} strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
    <figcaption data-result="projectile" className="text-sm tabular-nums">射程 {number(result.range)} m · 飞行时间 {number(result.time)} s · 最大高度 {number(result.height)} m</figcaption>
  </figure>
}

export function FunctionPlot(props: Parameters<typeof functionPlot>[0]) {
  const result = useMemo(() => functionPlot(props), [props.curves, props.domain, props.samples])
  const points = result.curves[0]?.points.map((point, index) => ({ x: point.x,
    ...Object.fromEntries(result.curves.map((curve, curveIndex) => [`curve${curveIndex}`, curve.points[index]?.y])),
  })) ?? []
  return <figure className="grid min-w-0 gap-2" aria-label="函数曲线比较">
    <ChartContainer className="h-56 w-full min-w-0" config={Object.fromEntries(result.curves.map((curve, index) => [`curve${index}`, { label: curve.id, color: colors[index % colors.length] }]))}>
      <LineChart data={points} margin={{ top: 8, right: 12, bottom: 8, left: 0 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="x" type="number" tickFormatter={number} /><YAxis width={48} tickFormatter={number} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {result.curves.map((curve, index) => <Line key={curve.id} name={curve.id} dataKey={`curve${index}`} type="linear" dot={false}
          stroke={colors[index % colors.length]} strokeDasharray={index % 2 ? '5 3' : undefined} strokeWidth={2} isAnimationActive={false} />)}
      </LineChart>
    </ChartContainer>
    <figcaption data-result="functions" className="grid gap-1 text-sm tabular-nums">
      {props.curves.map(curve => <p key={curve.id}>{curve.id}: y = {curve.a}x² + {curve.b}x + {curve.c}</p>)}
      {result.intersections.map(intersection => <p key={`${intersection.firstId}:${intersection.secondId}`}>
        {intersection.firstId} 与 {intersection.secondId}：{intersection.kind === 'coincident' ? '曲线重合' : intersection.kind === 'none' ? '当前范围内无交点'
          : `当前范围内交点 ${intersection.points.map(point => `(${number(point.x)}, ${number(point.y)})`).join('、')}`}
      </p>)}
    </figcaption>
  </figure>
}

function Pixels({ values, size, label }: { values: number[]; size: number; label: string }) {
  return <div className="grid min-w-0 gap-1"><span className="text-sm">{label}</span>
    <div role="img" aria-label={`${size}×${size} ${label}`} className="grid aspect-square w-full max-w-48 overflow-hidden rounded border border-border"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
      {values.map((value, index) => <span key={index} style={{ backgroundColor: `rgb(${Math.round(Math.max(0, Math.min(1, value)) * 255)} ${Math.round(Math.max(0, Math.min(1, value)) * 255)} ${Math.round(Math.max(0, Math.min(1, value)) * 255)})` }} />)}
    </div>
  </div>
}

export function DctImage(props: Parameters<typeof dctImage>[0]) {
  const result = useMemo(() => dctImage(props), [props.size, props.keep, props.pixels])
  return <figure className="grid min-w-0 gap-3" aria-label="DCT 图像重建">
    <div className="grid grid-cols-2 gap-3"><Pixels values={result.original} size={result.size} label="原图" /><Pixels values={result.reconstructed} size={result.size} label="重建图像" /></div>
    <figcaption data-result="dct" className="text-sm tabular-nums">保留 {props.keep} / {result.size ** 2} 个系数 · 均方误差 {number(result.mse)} · 最大误差 {number(result.maxError)}</figcaption>
    <details className="text-sm"><summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-ring">查看系数与重建数值</summary>
      <div role="region" aria-label="DCT 数值" tabIndex={0} className="mt-2 max-h-48 overflow-auto rounded border border-border focus-visible:outline-2 focus-visible:outline-ring">
        <table className="w-full text-start text-xs tabular-nums"><thead><tr><th scope="col">索引</th><th scope="col">系数</th><th scope="col">原像素</th><th scope="col">重建像素</th></tr></thead>
          <tbody>{result.original.map((value, index) => <tr key={index}><th scope="row">{index}</th><td>{number(result.coefficients[index])}</td><td>{number(value)}</td><td>{number(result.reconstructed[index])}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  </figure>
}

function useSimulation(request: ScienceRequest) {
  const ref = useRef<HTMLElement>(null), [visible, setVisible] = useState(false)
  const [result, setResult] = useState<{ key: string; value: ScienceResult | 'error' } | null>(null)
  const key = JSON.stringify(request)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: '200px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    let active = true
    const worker = new Worker(new URL('./science-worker.ts', import.meta.url), { type: 'module' })
    setResult(null)
    worker.onmessage = (event: MessageEvent<ScienceResult | { error: true }>) => { if (active) setResult({ key, value: 'error' in event.data ? 'error' : event.data }) }
    worker.onerror = () => { if (active) setResult({ key, value: 'error' }) }
    worker.postMessage(JSON.parse(key))
    return () => { active = false; worker.onmessage = null; worker.onerror = null; worker.terminate() }
  }, [key, visible])
  return { ref, result: result?.key === key ? result.value : null }
}

export function CltPlot(props: Extract<ScienceRequest, { kind: 'clt' }>['input']) {
  const { ref, result } = useSimulation({ kind: 'clt', input: props })
  const value = result && result !== 'error' && result.kind === 'clt' ? result.value : null
  return <figure ref={ref} className="grid min-w-0 gap-2" aria-label="样本均值分布" aria-busy={result === null}>
    {value ? <>
      <ChartContainer className="h-56 w-full min-w-0" config={{ count: { label: '次数', color: colors[0] } }}>
        <BarChart data={value.histogram.map(bin => ({ ...bin, midpoint: (bin.lower + bin.upper) / 2 }))} accessibilityLayer>
          <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="midpoint" tickFormatter={number} /><YAxis width={40} /><ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="count" fill={colors[0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <figcaption data-result="clt" className="text-sm tabular-nums">样本均值：{number(value.mean)}（理论 {number(value.theoreticalMean)}）；方差：{number(value.variance)}（理论 {number(value.theoreticalVariance)}）；重复 {props.trials} 次</figcaption>
    </> : <p role={result === 'error' ? 'alert' : 'status'} className="text-sm text-muted-foreground">{result === 'error' ? '这些参数无法计算，请调整后重试。' : '正在计算样本分布…'}</p>}
  </figure>
}

export function MontyHall({ selectedDoor, reveal, switchDoor, trials, seed }: {
  selectedDoor: 0 | 1 | 2; reveal: boolean; switchDoor: boolean; trials: number; seed: number
}) {
  const game = useMemo(() => montyHallGame({ seed, selectedDoor }), [seed, selectedDoor])
  const { ref, result } = useSimulation({ kind: 'monty', input: { seed, trials } })
  const simulation = result && result !== 'error' && result.kind === 'monty' ? result.value : null
  return <figure ref={ref} className="grid min-w-0 gap-3" aria-label="蒙提霍尔选门实验">
    <ol className="grid grid-cols-3 gap-2">{[0, 1, 2].map(door => <li key={door} className="grid min-w-0 gap-1 rounded-lg border border-border bg-muted/30 p-3 text-center text-sm">
      <span>{door + 1} 号门</span><span>{reveal && door === game.openedDoor ? '已打开：羊' : '未打开'}</span>
      <span className="text-xs">{door === selectedDoor ? '你的选择' : reveal && door === game.switchDoor ? '可以换到这里' : '\u00a0'}</span>
    </li>)}</ol>
    <figcaption data-result="monty" className="grid gap-1 text-sm tabular-nums">
      {reveal && <p>{switchDoor ? '换门' : '不换门'}：{(switchDoor ? game.switchWins : game.stayWins) ? '获得奖品' : '未获得奖品'}，奖品在 {game.prizeDoor + 1} 号门。</p>}
      <p>理论胜率：不换门 1/3，换门 2/3。</p>
      {simulation ? <p>{trials} 次模拟：不换门胜率 {number(simulation.stayRate * 100)}%，换门胜率 {number(simulation.switchRate * 100)}%。</p>
        : <p role={result === 'error' ? 'alert' : 'status'}>{result === 'error' ? '模拟未完成，请调整次数后重试。' : '正在重复模拟…'}</p>}
    </figcaption>
  </figure>
}
