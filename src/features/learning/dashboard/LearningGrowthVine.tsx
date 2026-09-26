import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/stores/auth'
import type { LearningGrowthLearner } from '../contracts'
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

export function LearningGrowthVine({ projectId }: { projectId: string }) {
  const { learners, loading, error, refresh } = useLearningGrowth(projectId)
  const userId = useAuth((state) => state.user?.id)
  const titleId = useId()
  const descriptionId = useId()
  const [view, setView] = useState({ width: 900, left: 0 })
  const viewport = useRef<HTMLDivElement>(null)
  const positionedUserId = useRef<string | null>(null)
  const drag = useRef<{ pointerId: number; x: number; left: number } | null>(null)
  const layout = useMemo(() => layoutLearningVine(learners, view.width), [learners, view.width])
  const own = learners.find((learner) => learner.learnerId === userId)
  const stones = useMemo(
    () => visibleVineWaypoints(own?.waypoints ?? [], layout.scale),
    [own, layout.scale],
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
  const metric = (value: number | undefined) => value === undefined && (loading || error) ? '—' : number.format(value ?? 0)

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const measure = () => setView({ width: element.clientWidth, left: element.scrollLeft })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (loading || !own || positionedUserId.current === own.learnerId) return
    positionedUserId.current = own.learnerId
    viewport.current?.scrollTo({ left: vineScrollTarget(own.points, layout, view.width), behavior: 'instant' })
  }, [loading, own, layout, view.width])

  const moveTo = (points: number) => {
    viewport.current?.scrollTo({ left: vineScrollTarget(points, layout, view.width), behavior: 'instant' })
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
      <h2 id={titleId} className="sr-only">学习成长藤蔓</h2>
      <p id={descriptionId} className="sr-only">左右浏览成长足迹，点击头像查看学习进度。Home 返回起点，End 前往最远足迹。</p>

      {error && <p role="alert" className="vine-error">{error}{learners.length > 0 ? ' 当前显示上次加载的记录。' : ''} <button type="button" className="underline underline-offset-4" disabled={loading} onClick={() => void refresh()}>重试</button></p>}

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
          <div className="vine-art" aria-hidden="true" style={{ backgroundImage: `url(${vineImage})` }} />
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
                  aria-label={`${own?.displayName}的足迹：${number.format(stone.position)} 成长值，${stone.evidenceCount} 项学习证据，${stone.objectiveCount} 项目标掌握`}
                ><span aria-hidden="true" /></button>
              </PopoverTrigger>
              <PopoverContent className="vine-popover max-w-[calc(100vw-2rem)]">
                <p className="font-medium">{own?.displayName} · {number.format(stone.position)} 成长值</p>
                <p className="text-sm text-muted-foreground">{stone.evidenceCount} 项证据 · {stone.objectiveCount} 项目标掌握</p>
              </PopoverContent>
            </Popover>
          ))}

          {layout.groups.filter((group) => isVisible(group.x)).map((group) => {
            const active = group.learners.find((learner) => learner.learnerId === userId)
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
                    <button type="button" className="vine-learner-button"
                      aria-label={group.learners.length === 1 ? `${shown[0].displayName}，${number.format(shown[0].points)} 成长值，查看进展` : `${group.learners.length} 位同学，查看学习进度`}>
                      <span className="vine-avatars">
                        {shown.slice(0, 2).map((learner) => <span key={learner.learnerId}><LearnerAvatar learner={learner} size={shown.length > 1 ? 32 : 38} /></span>)}
                        {shown.length > 2 && <span className="vine-more">+{number.format(shown.length - 2)}</span>}
                      </span>
                      <span className="vine-learner-name">{shown[0].displayName}{shown[0].learnerId === userId ? '（我）' : ''}{group.learners.length > 1 ? ` 等 ${group.learners.length} 人` : ''}</span>
                    </button>
                  </PopoverTrigger>
                </div>
                <PopoverContent className="vine-popover grid max-h-64 max-w-[calc(100vw-2rem)] gap-3 overflow-y-auto">
                  {shown.map((learner) => <div key={learner.learnerId}>
                    <p className="font-medium">{learner.displayName} · {number.format(learner.points)} 成长值</p>
                    <p className="text-sm text-muted-foreground">{learner.evidenceCount} 项证据 · {learner.acceptedCount} 项已通过 · {learner.independentCount} 项独立完成</p>
                  </div>)}
                </PopoverContent>
              </Popover>
            )
          })}

          {layout.furthest > 0 && isVisible(frontier) && <div className="vine-frontier" style={{ left: frontier, top: vineSurfaceY(frontier) + 76 }}><span>{number.format(layout.furthest)}</span></div>}
          {layout.furthest === 0 && <p className="vine-empty" role="status">
            {loading ? '加载中…' : error && learners.length === 0 ? '加载失败' : learners.length === 0 ? '暂无学习记录' : null}
          </p>}
        </div>
      </div>

      <footer className="vine-footer">
        <dl className="vine-metrics" aria-label="我的学习进度" aria-live="polite">
          <div><dt>成长值</dt><dd>{metric(own?.points)}</dd></div>
          <div><dt>已通过 / 证据</dt><dd>{metric(own?.acceptedCount)}<span> / {metric(own?.evidenceCount)}</span></dd></div>
          <div><dt>独立完成</dt><dd>{metric(own?.independentCount)}</dd></div>
        </dl>
      </footer>
    </section>
  )
}
