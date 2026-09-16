import { ArrowLeft, ArrowRight, LocateFixed, RefreshCw, Sprout } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/stores/auth'
import type { LearningGrowthLearner, LearningSpace } from '../contracts'
import vineImage from './assets/learning-vine.webp'
import {
  layoutLearningVine,
  VINE_ORIGIN,
  vineScrollTarget,
  vineSurfaceY,
  visibleVineWaypoints,
} from './learningVineModel'
import { useLearningGrowth } from './useLearningGrowth'
import './learning-vine.css'

const number = new Intl.NumberFormat('zh-CN')

function LearnerAvatar({ learner, size = 38 }: { learner: LearningGrowthLearner; size?: number }) {
  return <Avatar size={size} animated={false} p={{
    id: learner.learnerId, kind: 'human', name: learner.displayName,
    initial: learner.displayName.slice(0, 1), avatarBg: '#526447',
    avatarUrl: learner.avatarUrl, status: 'resting',
  }} />
}

export function LearningGrowthVine({ space }: { space: LearningSpace }) {
  const { learners, loading, error, refresh } = useLearningGrowth(space.projectId)
  const userId = useAuth((state) => state.user?.id)
  const titleId = useId()
  const descriptionId = useId()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState({ width: 900, left: 0 })
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; x: number; left: number } | null>(null)
  const layout = useMemo(() => layoutLearningVine(learners, view.width), [learners, view.width])
  const own = learners.find((learner) => learner.learnerId === userId)
  const selected = learners.find((learner) => learner.learnerId === selectedId)
    ?? own ?? learners.find((learner) => learner.points === layout.furthest)
  const stones = useMemo(
    () => visibleVineWaypoints(selected?.waypoints ?? [], layout.scale),
    [selected, layout.scale],
  )
  const sharedStones = useMemo(() => {
    const slots = new Map<number, number>()
    for (const learner of learners) {
      for (const point of learner.waypoints) {
        const x = layout.x(point.position)
        const slot = Math.floor(x / 28)
        slots.set(slot, Math.max(slots.get(slot) ?? 0, x))
      }
    }
    return [...slots.values()]
  }, [learners, layout])
  const frontier = layout.x(layout.furthest)
  const isVisible = (x: number) => x >= view.left - 120 && x <= view.left + view.width + 120

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const measure = () => setView({ width: element.clientWidth, left: element.scrollLeft })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [])

  const moveTo = (points: number) => {
    viewport.current?.scrollTo({ left: vineScrollTarget(points, layout, view.width), behavior: 'instant' })
  }
  const selectLearner = (learner: LearningGrowthLearner) => {
    setSelectedId(learner.learnerId)
    moveTo(learner.points)
  }
  const pathStart = Math.max(VINE_ORIGIN, view.left - 24)
  const pathEnd = Math.min(frontier, view.left + view.width + 24)
  const path: string[] = []
  if (pathEnd > pathStart) {
    for (let x = pathStart; x < pathEnd; x += 12) path.push(`${path.length ? 'L' : 'M'}${x},${vineSurfaceY(x)}`)
    path.push(`L${pathEnd},${vineSurfaceY(pathEnd)}`)
  }

  return (
    <section className="learning-vine" aria-labelledby={titleId} aria-busy={loading}>
      <header className="vine-header">
        <div>
          <p className="vine-eyebrow"><Sprout size={14} aria-hidden="true" /> 一起生长</p>
          <h2 id={titleId}>每一步，都留下足迹</h2>
          <p id={descriptionId} className="vine-description">
            {'同一门课，同一个起点。每份学习证据，都让藤蔓向前。'}
          </p>
        </div>
        <div className="vine-header-actions">
          <span className="vine-count">{loading && learners.length === 0 ? '汇集足迹中' : `${number.format(learners.length)} 位同行者`}</span>
          <button type="button" className="vine-control vine-icon-control" disabled={loading} onClick={() => void refresh()} aria-label="刷新成长足迹" title="刷新成长足迹">
            <RefreshCw size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      {error && <p role="alert" className="vine-error">{error}{learners.length > 0 ? ' 当前显示上次加载的记录。' : ' 请点击刷新重试。'}</p>}

      <div
        ref={viewport}
        className="vine-viewport"
        role="region"
        aria-label="学习藤蔓，可左右浏览已走过的区域"
        aria-describedby={descriptionId}
        tabIndex={0}
        onScroll={(event) => {
          const left = event.currentTarget.scrollLeft
          setView((current) => ({ ...current, left }))
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            moveTo(event.key === 'Home' ? 0 : layout.furthest)
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || event.pointerType === 'touch' || (event.target as Element).closest('button,input,select,a')) return
          drag.current = { pointerId: event.pointerId, x: event.clientX, left: event.currentTarget.scrollLeft }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!drag.current || event.pointerId !== drag.current.pointerId) return
          event.currentTarget.scrollLeft = drag.current.left + drag.current.x - event.clientX
        }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
        onLostPointerCapture={() => { drag.current = null }}
      >
        <div className="vine-world" style={{ width: layout.width }}>
          <div className="vine-art" aria-hidden="true" style={{ width: frontier + VINE_ORIGIN, backgroundImage: `url(${vineImage})` }} />
          <svg className="vine-path" aria-hidden="true" width={view.width} height="304" viewBox={`${view.left} 0 ${view.width} 304`} style={{ left: view.left }}>
            <path d={path.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 7" opacity="0.55" />
            {sharedStones.filter(isVisible).map((x) => <ellipse key={x} cx={x} cy={vineSurfaceY(x)} rx="5" ry="3" transform={`rotate(-30 ${x} ${vineSurfaceY(x)})`} fill="currentColor" opacity="0.4" />)}
          </svg>

          {isVisible(VINE_ORIGIN) && <div className="vine-origin" style={{ left: VINE_ORIGIN, top: vineSurfaceY(VINE_ORIGIN) }}>
            <span className="vine-origin-dot" /><span className="vine-origin-label">共同起点 <b>0</b></span>
          </div>}

          {stones.filter((stone) => isVisible(layout.x(stone.position))).map((stone) => (
            <Popover key={stone.position}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="vine-stone"
                  style={{ left: layout.x(stone.position), top: vineSurfaceY(layout.x(stone.position)) }}
                  aria-label={`${selected?.displayName}的足迹：${number.format(stone.position)} 成长值，${stone.evidenceCount} 项学习证据，${stone.objectiveCount} 项目标掌握`}
                ><span aria-hidden="true" /></button>
              </PopoverTrigger>
              <PopoverContent className="vine-popover max-w-[calc(100vw-2rem)]">
                <p className="font-medium">{selected?.displayName} · {number.format(stone.position)} 成长值</p>
                <p className="text-sm text-muted-foreground">这枚足迹记录了 {stone.evidenceCount} 项学习证据与 {stone.objectiveCount} 项目标掌握。</p>
              </PopoverContent>
            </Popover>
          ))}

          {layout.groups.filter((group) => isVisible(group.x)).map((group) => {
            const active = group.learners.find((learner) => learner.learnerId === selected?.learnerId)
            const shown = active ? [active, ...group.learners.filter((learner) => learner !== active)] : group.learners
            const anchor = active ? layout.x(active.points) : group.x
            const y = vineSurfaceY(group.x)
            const top = y - 118
            return (
              <Popover key={group.learners[0].learnerId}>
                <div className="vine-learner" data-selected={Boolean(active)} style={{ left: group.x, top }}>
                  <svg className="vine-learner-stem" aria-hidden="true" width={anchor - group.x + 88} height={vineSurfaceY(anchor) - top + 2}>
                    <path d={`M44 62 Q44 96 ${anchor - group.x + 44} ${vineSurfaceY(anchor) - top}`} fill="none" stroke="currentColor" />
                  </svg>
                  <PopoverTrigger asChild>
                    <button type="button" className="vine-learner-button" onClick={() => { if (group.learners.length === 1) setSelectedId(group.learners[0].learnerId) }}
                      aria-label={group.learners.length === 1 ? `${shown[0].displayName}，${number.format(shown[0].points)} 成长值，查看进展` : `${group.learners.length} 位同学在此，选择同学查看精确位置和进展`}>
                      <span className="vine-avatars">
                        {shown.slice(0, 2).map((learner) => <span key={learner.learnerId}><LearnerAvatar learner={learner} size={shown.length > 1 ? 32 : 38} /></span>)}
                        {shown.length > 2 && <span className="vine-more">+{number.format(shown.length - 2)}</span>}
                      </span>
                      <span className="vine-learner-name">{shown[0].displayName}{shown[0].learnerId === userId ? '（我）' : ''}{group.learners.length > 1 ? ` 等 ${group.learners.length} 人` : ''}</span>
                    </button>
                  </PopoverTrigger>
                </div>
                <PopoverContent className="vine-popover max-w-[calc(100vw-2rem)]">
                  {group.learners.length > 1 ? <label className="grid gap-2 text-sm">
                    选择同行者，查看精确位置
                    <select className="w-full rounded-lg border bg-background p-2 text-foreground" value={active?.learnerId ?? shown[0].learnerId}
                      onChange={(event) => { const learner = group.learners.find((item) => item.learnerId === event.target.value); if (learner) selectLearner(learner) }}>
                      {group.learners.map((learner) => <option key={learner.learnerId} value={learner.learnerId}>{learner.displayName} · {number.format(learner.points)} 成长值</option>)}
                    </select>
                  </label> : <p className="font-medium">{shown[0].displayName} · {number.format(shown[0].points)} 成长值</p>}
                  <p className="text-sm text-muted-foreground">{(active ?? shown[0]).evidenceCount} 项证据 · {(active ?? shown[0]).acceptedCount} 项已通过 · {(active ?? shown[0]).independentCount} 项独立完成</p>
                  <button type="button" className="rounded-lg border px-3 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring" onClick={() => selectLearner(active ?? shown[0])}>查看这位同学的足迹</button>
                </PopoverContent>
              </Popover>
            )
          })}

          {layout.furthest > 0 && isVisible(frontier) && <div className="vine-frontier" style={{ left: frontier, top: vineSurfaceY(frontier) + 76 }}><span>{number.format(layout.furthest)}</span> · 还在生长</div>}
          {layout.furthest === 0 && <p className="vine-empty" role="status">
            {loading ? '正在汇集学习足迹…' : error && learners.length === 0 ? '暂时还无法看到这片学习风景。' : learners.length === 0 ? '同学加入课程后，会在这里一起出发。' : '都在起点，下一份学习证据就是新的生长。'}
          </p>}
        </div>
      </div>

      <div className="vine-navigation">
        <div className="vine-navigation-buttons">
          <button type="button" className="vine-control" onClick={() => moveTo(0)} disabled={view.left <= 1}><ArrowLeft size={14} aria-hidden="true" /> 起点</button>
          {own && <button type="button" className="vine-control" onClick={() => selectLearner(own)}><LocateFixed size={14} aria-hidden="true" /> 我的位置</button>}
          <button type="button" className="vine-control" onClick={() => moveTo(layout.furthest)} disabled={view.left + view.width >= layout.width - 1}>最远足迹 <ArrowRight size={14} aria-hidden="true" /></button>
        </div>
        <span className="vine-navigation-hint">{layout.width > view.width + 1 ? '左右拖动 · 仅浏览已走过的区域' : '共同起步，成长没有终点'}</span>
      </div>

      <footer className="vine-footer">
        {selected ? <>
          <label className="vine-selection">
            <span>正在查看</span>
            <select value={selected.learnerId} onChange={(event) => { const learner = learners.find((item) => item.learnerId === event.target.value); if (learner) selectLearner(learner) }} aria-label="选择学习者查看足迹">
              {learners.map((learner) => <option key={learner.learnerId} value={learner.learnerId}>{learner.displayName}{learner.learnerId === userId ? '（我）' : ''}</option>)}
            </select>
          </label>
          <div className="vine-metrics" aria-live="polite">
            <span><strong>{number.format(selected.points)}</strong> 成长值</span>
            <span><b>{number.format(selected.evidenceCount)}</b> 项证据</span>
            <span><b>{number.format(selected.acceptedCount)}</b> 项通过</span>
            <span><b>{number.format(selected.independentCount)}</b> 项独立完成</span>
          </div>
        </> : <span className="vine-description">真实的学习证据，会在这里留下足迹。</span>}
        <Popover>
          <PopoverTrigger asChild><button type="button" className="vine-rules">如何生长</button></PopoverTrigger>
          <PopoverContent className="vine-popover w-80 max-w-[calc(100vw-2rem)] text-sm">
            <p className="font-medium">成长值来自已记录的学习证据</p>
            <ul className="list-disc space-y-2 ps-4 text-muted-foreground">
              <li>每个活动或任务步骤的有效提交 +1；重复提交不重复累加。</li>
              <li>评价通过且展示了能力 +2；引导、提示、独立完成再分别 +1、+2、+3。同一活动或步骤取最佳有效记录。</li>
              <li>有证据支持的目标掌握，按等级 1–4 分别计 1、4、9、16。</li>
            </ul>
            <p className="text-muted-foreground">成长值持续累计，不按天数清零，也不设 100% 终点。较密集的足迹会合并，保留全部证据与累计值；它不替代课程成绩。</p>
          </PopoverContent>
        </Popover>
      </footer>
    </section>
  )
}
