import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { AgentCapability, Status } from '@/types'
import { useParticipants } from '../state'
import { AgentAvatarEditor } from './AgentAvatarEditor'

const STATUS: Record<Status, string> = { avail: '可用', working: '工作中', thinking: '思考中', waiting: '等待确认', resting: '休息中' }
const CAPABILITIES: Record<AgentCapability, string> = { canvas: '共享画布', web: '网页研究', files: '文件', email: '邮件', documents: '文档', calendar: '日历', knowledge: '知识库', learning: '学习辅导', teacher_admin: '教学管理', handoffs: '协作交接', routines: '定时任务' }
const ORDER = ['nova', 'sage', 'milo', 'trace', 'scout', 'forge', 'pulse']

export function AgentsPage() {
  const { byId, loaded, error, load } = useParticipants()
  const agents = Object.values(byId).filter(agent => agent.kind === 'agent' && !agent.departedAt)
    .sort((a, b) => (ORDER.indexOf(a.presetKey ?? '') < 0 ? 99 : ORDER.indexOf(a.presetKey!)) - (ORDER.indexOf(b.presetKey ?? '') < 0 ? 99 : ORDER.indexOf(b.presetKey!)))
  return <div className="flex h-full min-h-0 min-w-0 flex-col" data-page="agents">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 md:px-6">
      <div><h1 className="text-xl font-semibold tracking-tight">Agent <span className="ms-2 text-sm font-normal text-muted-foreground">智能体团队</span></h1><p className="mt-1 text-sm text-muted-foreground">了解各自的专长，找到适合当前任务的伙伴。</p></div>
      {loaded && !error && <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">{agents.length} 位团队成员</span>}
    </header>
    <section aria-label="智能体列表" className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-muted/20 p-4 md:p-6">
      {!loaded && <p role="status" className="p-3 text-sm text-muted-foreground">正在加载智能体…</p>}
      {error && <div role="alert" className="p-3 text-sm text-destructive">{error}<Button variant="outline" onClick={() => void load()}>重试</Button></div>}
      {loaded && !error && !agents.length && <p className="p-3 text-sm text-muted-foreground">当前工作区暂无可用智能体。</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map(agent => <Dialog key={agent.id}>
          <DialogTrigger asChild>
            <button type="button" aria-label={`查看${agent.name}的资料`} className="flex min-w-0 flex-col rounded-lg border bg-background p-5 text-start outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
              <span className="flex w-full items-center gap-3"><Avatar p={agent} size={48} /><span className="min-w-0 flex-1 break-words text-lg font-semibold">{agent.name}</span><span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{STATUS[agent.status]}</span></span>
              {agent.role && <span className="mt-4 text-sm font-medium">{agent.role}</span>}
              {agent.bio && <span className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{agent.bio}</span>}
              <span className="mt-auto pt-4 text-xs text-muted-foreground">查看资料 →</span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader className="pe-8"><DialogTitle>{agent.name}</DialogTitle><DialogDescription>{agent.role || '智能体资料'} · {STATUS[agent.status]}</DialogDescription></DialogHeader>
            <div className="flex items-center gap-4"><AgentAvatarEditor agent={agent} /><p className="text-xs leading-relaxed text-muted-foreground">点击头像更换<br />自定义头像仅自己可见</p></div>
            {agent.bio && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{agent.bio}</p>}
            {!!agent.capabilities?.length && <div><h3 className="mb-2 text-xs font-medium text-muted-foreground">可用能力</h3><ul className="flex flex-wrap gap-1.5">{agent.capabilities.map(capability => <li key={capability} className="rounded-md border bg-muted/30 px-2 py-1 text-xs">{CAPABILITIES[capability]}</li>)}</ul></div>}
            {agent.email && <p className="break-all text-xs text-muted-foreground">邮箱：{agent.email}</p>}
          </DialogContent>
        </Dialog>)}
      </div>
    </section>
  </div>
}
