import { SkeletonRegion } from '@/components/ResourceSkeleton'

const bar = 'block rounded-md bg-skeleton motion-safe:animate-pulse'

function AgentTurn({ widths }: { widths: string[] }) {
  return <div className="flex flex-col gap-2.5">
    <div className="flex items-center gap-2">
      <span className={`${bar} size-[22px] rounded-[7px]`} />
      <span className={`${bar} h-[11px] w-14`} />
    </div>
    {widths.map((width, index) => <span key={index} className={`${bar} h-3`} style={{ width }} />)}
  </div>
}

/** Same column, gaps and turn shapes as the loaded thread, so nothing jumps on arrival. */
export function ConversationSkeleton() {
  return <SkeletonRegion label="正在加载对话消息" aria-busy="true" className="flex w-full flex-1 flex-col gap-7 py-3.5">
    <div className="flex justify-end"><span className={`${bar} h-10 w-[46%] rounded-[18px_18px_6px_18px]`} /></div>
    <AgentTurn widths={['100%', '94%', '62%']} />
    <div className="flex justify-end"><span className={`${bar} h-10 w-[34%] rounded-[18px_18px_6px_18px]`} /></div>
    <AgentTurn widths={['100%', '88%', '96%', '48%']} />
  </SkeletonRegion>
}
