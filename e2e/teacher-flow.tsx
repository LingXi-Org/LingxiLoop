import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppThemeProvider } from '@/components/AppThemeProvider'
import { GlobalInteractionProvider } from '@/components/GlobalInteractionProvider'
import { ApprovalPart } from '@/components/messages/MessageToolParts'
import {
  AttentionCardsPart,
  BriefingMessagePart,
  EvidenceSheetPart,
} from '@/components/messages/TeacherMessageParts'
import { Button } from '@/components/ui/button'
import { EnterpriseIntegrationCapabilities } from '@/features/education/components/EnterpriseIntegrationCapabilities'
import type { Message } from '@/types'
import './styles.css'

const briefingMessage: Message = {
  id: 'briefing-e2e',
  conversationId: 'teacher-room-e2e',
  authorId: 'pulse-e2e',
  kind: 'system',
  body: 'Retrieval Studio 本周有新的学习证据与复测事项。',
  at: '09:00',
  createdAt: '2026-08-30T01:00:00.000Z',
  teacherBriefing: {
    briefingId: 'briefing-e2e',
    windowStartSequence: 40,
    windowEndSequence: 48,
    statistics: { eventCount: 8, assessmentSubmitted: 3, caseUpdated: 2, attentionCount: 1 },
    attentionItemIds: ['attention-e2e-1'],
  },
}

function approvalMessage(id: string, summary: string): Message {
  return {
    id,
    conversationId: 'teacher-room-e2e',
    authorId: 'pulse-e2e',
    kind: 'approval',
    body: summary,
    at: '09:01',
    createdAt: '2026-08-30T01:01:00.000Z',
    approval: {
      id,
      agentId: 'pulse-e2e',
      kind: 'learning_evaluation',
      summary,
      status: 'PENDING',
      payload: { args: { evaluationId: 'evaluation-e2e', decision: 'reject' } },
      requestedAt: '2026-08-30T01:01:00.000Z',
    },
  }
}

function TeacherProjectFixture() {
  const [entered, setEntered] = useState(false)
  const [receipts, setReceipts] = useState<string[]>([])
  const record = (id: string) => (result: { decision: 'approved' | 'denied'; persisted: true }) => {
    setReceipts((current) => [...current, `${id}:${result.decision}`])
  }

  if (!entered) {
    return <main className="mx-auto grid min-h-screen max-w-5xl place-items-center p-8">
      <section className="w-full max-w-xl rounded-3xl border bg-card p-8 shadow-sm">
        <p className="text-sm text-muted-foreground">Teacher Projects</p>
        <h1 className="mt-2 text-2xl font-semibold">Retrieval Studio</h1>
        <Button className="mt-6" onClick={() => setEntered(true)}>进入 Project</Button>
      </section>
    </main>
  }

  return <main data-product-surface="teacher-project" className="mx-auto min-h-screen max-w-6xl space-y-8 p-8">
    <header>
      <p className="text-sm text-muted-foreground">Teacher Project</p>
      <h1 className="text-2xl font-semibold">Retrieval Studio</h1>
    </header>
    <section aria-label="Project Briefing" className="space-y-2">
      <BriefingMessagePart message={briefingMessage} />
      <AttentionCardsPart message={briefingMessage} />
      <EvidenceSheetPart message={briefingMessage} />
    </section>
    <section aria-labelledby="approval-heading" className="space-y-4">
      <h2 id="approval-heading" className="text-lg font-semibold">待审批教学操作</h2>
      {[
        ['modify-approval', '修改学习评价建议'],
        ['approve-approval', '批准学习评价建议'],
        ['reject-approval', '拒绝学习评价建议'],
      ].map(([id, summary]) => <div key={id} data-testid={id}>
        <ApprovalPart message={approvalMessage(id, summary)} addResult={record(id)} />
      </div>)}
      <output aria-label="审批回执">{receipts.join(',')}</output>
    </section>
    <EnterpriseIntegrationCapabilities />
  </main>
}

createRoot(document.getElementById('root')!).render(
  <AppThemeProvider>
    <GlobalInteractionProvider><TeacherProjectFixture /></GlobalInteractionProvider>
  </AppThemeProvider>,
)
