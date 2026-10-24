import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GenUiCard } from '@/features/chat/visualize/zcode/gen-ui/components/GenUiCard'
import { LearningHelpActions } from '@/features/chat/components/LearningHelpActions'
import { appendLearningHelp } from '@/features/chat/components/learning-help'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import { useAuth } from '@/stores/auth'
import '@/styles/globals.css'

useAuth.setState({ activeCompanyId: 'fixture-company', ready: true, user: { id: 'fixture-student', email: 'student@example.invalid', name: '学生' } })
setWorkspaceSession({ companyId: 'fixture-company', projectId: 'fixture-project' })
await fetch('/__visualize_fixture/reset')
function LearningFixture() {
  const [attempt, setAttempt] = useState('我认为每个子网需要 32 个地址。')
  const [version, setVersion] = useState(1)
  const [actor, setActor] = useState('fixture-student')
  const target = { workspacePath: 'fixture-project', workspaceIdentity: 'fixture-company', sessionId: 'fixture-learning',
    path: `/fixture/learning-${version}.html`, instanceKey: `learning-${version}`, sourceMessageId: `fixture-source-${version}` }
  return <main className="h-dvh p-4" data-density="comfortable">
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel id="attempt" defaultSize="40%" minSize="20%" className="p-4">
        <h1 className="text-lg font-semibold">网络划分练习</h1>
        <p className="py-3">阅读拓扑图，保存你的划分判断，再向助教询问需要核对的步骤。</p>
        <textarea aria-label="我的推导" className="w-full rounded border p-3" value={attempt} onChange={e => setAttempt(e.target.value)} />
        <LearningHelpActions onSelect={intent => setAttempt(text => appendLearningHelp(text, intent))} />
        <button type="button" className="mt-4 rounded border p-2" onClick={() => setVersion(value => value === 1 ? 2 : 1)}>{version === 1 ? '打开后续回复中的下一版' : '对照上一版'}</button>
        <button type="button" className="mt-4 rounded border p-2" onClick={() => {
          const next = actor === 'fixture-student' ? 'fixture-peer' : 'fixture-student'
          useAuth.setState({ user: { id: next, email: `${next}@example.invalid`, name: next } }); setActor(next)
        }}>切换验收账号</button>
        <p className="pt-3 text-sm text-muted-foreground">本地验收：后续版本为预设引用，API 为确定性夹具。</p>
      </ResizablePanel>
      <ResizableHandle aria-label="调整练习与作品宽度" withHandle />
      <ResizablePanel id="work" minSize="30%" className="overflow-auto p-4">
        <h2 className="font-medium">拓扑方案 · 第 {version} 版</h2>
        <GenUiCard key={`${actor}:${version}`} target={target} reference={{ path: target.path, title: `网络拓扑 · 第 ${version} 版` }} />
      </ResizablePanel>
    </ResizablePanelGroup>
  </main>
}
createRoot(document.getElementById('root')!).render(<LearningFixture />)
