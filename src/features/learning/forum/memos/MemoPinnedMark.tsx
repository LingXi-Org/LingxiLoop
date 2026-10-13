// Adapted from usememos/memos (MIT), commit 8120a6cee03003ee7968b49b2109f816fa4d96a4. See LICENSE.
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
export default function MemoPinnedMark() {
  return <Tooltip><TooltipTrigger asChild><span role="img" aria-label="教师置顶" tabIndex={0} className="absolute -end-px -top-px size-5 cursor-default rounded-se-lg bg-primary [clip-path:polygon(0_0,100%_0,100%_100%)] transition-[width,height] duration-150 ease-out group-hover/memo:size-6 motion-reduce:transition-none" /></TooltipTrigger><TooltipContent>教师置顶</TooltipContent></Tooltip>
}
