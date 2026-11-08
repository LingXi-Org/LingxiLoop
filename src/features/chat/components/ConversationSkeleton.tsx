import type { CSSProperties } from 'react'
import { SkeletonRegion } from '@/components/ResourceSkeleton'

/** One shimmering placeholder block. */
export function Sk({ w, h, r = 6, style }: { w: number | string; h: number; r?: number | string; style?: CSSProperties }) {
  return <span className="lx-sk block shrink-0" style={{ width: w, height: h, borderRadius: r, ...style }} />
}

function Lines({ widths }: { widths: string[] }) {
  return <div className="flex flex-col gap-3">{widths.map((width, index) => <Sk key={index} w={width} h={13} />)}</div>
}

/** Same column, gaps and turn shapes as the loaded thread (切换会话 board), so nothing jumps on arrival. */
export function ConversationSkeleton() {
  return <SkeletonRegion label="正在加载对话消息" aria-busy="true" className="flex w-full flex-1 flex-col gap-7 pb-2 pt-1">
    <div className="flex items-center gap-3"><span className="h-px flex-1 bg-border" /><Sk w={120} h={10} /><span className="h-px flex-1 bg-border" /></div>
    <div className="flex justify-end"><Sk w="46%" h={42} r="16px 16px 4px 16px" /></div>
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2"><Sk w={22} h={22} r={7} /><Sk w={48} h={11} /><Sk w={96} h={20} r={10} /></div>
      <Lines widths={['100%', '97%', '100%', '58%']} />
      <div className="pt-1.5"><Sk w={200} h={16} /></div>
      <Lines widths={['100%', '94%', '72%']} />
      <div className="flex max-w-[440px] items-center gap-3 rounded-xl p-3 shadow-[0_0_0_1px_var(--border)]">
        <Sk w={40} h={40} r={9} />
        <div className="flex flex-1 flex-col gap-[9px]"><Sk w="52%" h={11} /><Sk w="34%" h={11} /></div>
      </div>
      <div className="flex gap-2">{[0, 1, 2, 3].map(index => <Sk key={index} w={18} h={18} r={5} />)}</div>
    </div>
    <div className="flex justify-end"><Sk w="30%" h={42} r="16px 16px 4px 16px" /></div>
  </SkeletonRegion>
}

/** Conversation list rows while the list loads. */
export function ConversationListSkeleton({ rows = 8 }: { rows?: number }) {
  return <SkeletonRegion label="正在加载会话" aria-busy="true" className="flex flex-col">
    <div className="px-2.5 pb-1 pt-2.5"><Sk w={28} h={10} /></div>
    {Array.from({ length: rows }, (_, index) => <div key={index} className="flex items-center gap-2.5 px-2.5 py-2">
      <Sk w={32} h={32} r="50%" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2"><Sk w={`${48 + (index * 17) % 30}%`} h={12} /><span className="flex-1" /><Sk w={28} h={10} /></div>
        <Sk w={`${62 + (index * 13) % 28}%`} h={10} />
      </div>
    </div>)}
  </SkeletonRegion>
}
