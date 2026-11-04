// The production case page and shell with disposable, credential-free local data.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '/src/components/ui/tooltip'
import { DesktopApp } from '/src/desktop/DesktopApp'
import { useAuth } from '/src/stores/auth'
import { useApp } from '/src/stores/app'
import { useWorkspace } from '/src/features/knowledge/workspace'
import { useConversations } from '/src/features/conversations/store'
import { casesApi } from '/src/features/cases/api'
import '@fontsource-variable/inter'
import '/src/styles/app.css'
import '/src/styles/experience.css'
import { instrumentCases } from './cases-benchmark'

const params = new URLSearchParams(location.search)
if (params.has('benchmark')) instrumentCases()
const manager = params.has('manager')
const companyId = params.get('company') || 'case-fixture'
const sourceBody = `这节课的目标很简单：学生离开教室时，能说清 FlashAttention 省的是什么、为什么数值结果不变。难点在于，大部分学生对“显存带宽”没有直觉。所以我没有从公式开始，而是从一道估算题开始。

## 课堂流程

| 时间 | 活动 |
| --- | --- |
| 0–8′ | **算一算**　让学生估算 n = 4096 时分数矩阵要搬几次 |
| 8–20′ | **画板讲解**　明理画出分块与 m、ℓ、O 三个统计量 |
| 20–35′ | **手算示例**　分组用 2×2 示例验证在线 softmax 的等价性 |
| 35–45′ | **生成作业**　老师在对话里让明理起草，课后审批发布 |

## 让画板替你板书

分块和统计量的部分我完全交给明理。它画得比我在黑板上快，而且学生可以在自己的对话里重放每一步。我只负责在关键处停下来提问。

> “既然结果一样，那省下来的到底是什么？”

## 在线 softmax 的那一步

这是全课最容易卡住的地方。我的做法是先只写分母的更新式，让学生自己推出修正因子不会大于 1，再补上输出 O 的部分。

## 作业与学生自评

课后作业是在对话里让明理起草的：三道题分别对应画板的第 1、3、4 步。学生提交后，各自的学习助手给出按知识点的自评——全班在“在线 softmax”上的掌握度明显偏低，下节课我据此多花了十分钟。`
const samples = [
  ['用一张画板讲透 FlashAttention：一节 45 分钟课的设计', '先让学生算一遍 n×n 矩阵要搬几次，再引出分块与在线 softmax。明理负责画板，老师负责提问，课后作业直接从对话里生成。', '王老师', 'softmax', '注意力机制'],
  ['KV 缓存到底占多少显存：让学生自己算', '从一个 7B 模型的真实配置出发，学生分组估算，再由成器在画板上逐项核对。', '李老师', 'kv', '推理优化'],
  ['工具调用失败时，agent 应该怎么说', '把三段失败对话投到屏幕上，让学生给 agent 改回复，再对照司南的版本讨论。', '陈老师', 'tool', 'Agent 设计'],
  ['用 agent 自评替代课后小测', '一个学期的尝试：自评覆盖知识点更细，老师省下的时间用来一对一答疑。', '王老师', 'sum', '课堂组织'],
  ['多头注意力的参数量，一道题讲三遍', '同一道计算题，分别用公式、画板和代码演示，看学生在哪一种讲法下最先听懂。', '赵老师', 'kv', '注意力机制'],
  ['LoRA 为什么只训练两个小矩阵', '从秩的直觉讲起，配一张可拖动的低秩分解画板，学生自己调 r 看效果。', '李老师', 'tool', '训练与微调'],
  ['投机解码：让小模型先猜', '用“抄作业”的比喻引入，再用一张时间线画板对比串行解码和投机解码。', '陈老师', 'softmax', '推理优化'],
]
const dates = ['2026-11-03', '2026-11-01', '2026-10-29', '2026-10-26', '2026-10-22', '2026-10-18', '2026-10-15']
const records = (params.has('empty') ? [] : samples).map(([title, summary, authorName, cover, category], i) => ({
  id: `sample-${i}`, title, summary, authorName, authorId: `author-${i}`, authorAvatarUrl: null,
  companyId, cover: `/scripts/fixtures/cases-assets/${cover}.png`, category, tags: i === 0 ? ['45 分钟 · 本科三年级'] : [], body: sourceBody,
  status: 'published', version: 1, publishedVersion: 1, hasUnpublishedChanges: false,
  canManage: manager, indexStatus: 'ready', indexError: null, publishedAt: dates[i], createdAt: dates[i], updatedAt: dates[i],
}))
if (params.has('more')) records.push(...records.slice(1).map((record, i) => ({ ...record, id: `extra-${i}`, publishedAt: '2026-10-01' })))
if (params.has('switchCompany')) records.push({ ...records[0], id: 'other-company', title: '第二组织专属案例', companyId: 'case-fixture-other' })
if (params.has('rich') && records[0]) {
  records[0].editorDocument = { schemaVersion: 1, blocks: [
    { id: 'intro', type: 'paragraph', content: [{ type: 'text', text: '富文本正文，核对目录与重复标题。', styles: {} }] },
    { id: 'one', type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '课堂流程', styles: {} }] },
    { id: 'two', type: 'paragraph', content: [{ type: 'text', text: '先尝试，再讨论。', styles: {} }] },
    { id: 'three', type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: '课堂流程', styles: {} }] },
  ], projection: records[0].body }
}
const published = new Map(records.map(record => [record.id, structuredClone(record)]))
const response = (record, view) => ({ ...structuredClone(view === 'reader' ? published.get(record.id) : record), view })
let listReads = 0
casesApi.list = async (q, category, view = 'reader') => {
  if (params.has('benchmark')) {
    document.documentElement.dataset.caseRequests = String(Number(document.documentElement.dataset.caseRequests || 0) + 1)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (params.has('error')) throw new Error('fixture read failure')
  const available = records.filter(record => record.companyId === useAuth.getState().activeCompanyId && (view === 'manage' || record.status === 'published'))
  listReads += 1
  return { items: available.map(record => {
    const item = response(record, view)
    if (params.has('pendingCover') && item.id === 'sample-4') item.generatedCover = {
      schemaVersion: 1, status: listReads === 1 ? 'pending' : 'ready', fingerprint: 'fixture-cover', generation: 1,
      alt: '相关案例封面已更新', previewUrl: listReads === 1 ? null : '/scripts/fixtures/cases-assets/sum.png', interactiveUrl: null, canRetry: false,
    }
    return item
  }).filter(record => (!category || record.category === category) && (!q || `${record.title} ${record.summary}`.toLowerCase().includes(q.toLowerCase()))),
    categories: ['注意力机制', '推理优化', 'Agent 设计', '训练与微调', '课堂组织'], canManage: manager, view }
}
casesApi.detail = async (id, view = 'reader') => {
  const record = records.find(item => item.id === id && item.companyId === useAuth.getState().activeCompanyId)
  if (!record || view === 'reader' && record.status !== 'published') throw new Error('not found')
  return { ...response(record, view), ...(id === 'sample-0' ? { cover: '/scripts/fixtures/cases-assets/softmax-detail.png' } : {}) }
}
casesApi.save = async (input, article) => {
  if (!manager) throw new Error('forbidden')
  let record = records.find(item => item.id === article?.id)
  if (!record) { record = { ...records[0], id: `new-${records.length}`, status: 'draft' }; records.push(record) }
  Object.assign(record, input, { version: (record.version ?? 0) + 1, hasUnpublishedChanges: true })
  return response(record, 'manage')
}
casesApi.action = async (article, action) => {
  if (!manager) throw new Error('forbidden')
  const record = records.find(item => item.id === article.id)
  if (action === 'publish') { record.status = 'published'; record.hasUnpublishedChanges = false; published.set(record.id, structuredClone(record)) }
  if (action === 'unpublish') record.status = 'unpublished'
  return response(record, 'manage')
}
useAuth.setState({ user: { id: 'case-reader', name: 'Y', email: 'reader@example.invalid' }, authenticated: true, ready: true,
  activeCompanyId: companyId, companies: [{ id: companyId, name: '验收组织', slug: companyId, role: manager ? 'teacher' : 'student', isAdmin: manager, status: 'ACTIVE' }] })
useWorkspace.setState({ selectedId: params.has('noCourse') ? null : 'fixture-project', loaded: true, companyId,
  list: [{ id: 'fixture-project', name: 'agent基础', status: 'ACTIVE' }] })
useConversations.setState({ list: [], loaded: true, projectId: 'fixture-project' })
useApp.setState({ view: 'cases', selectedConversationId: null, navigationPending: false, navigationReady: true })
const space = { projectId: 'fixture-project', courseId: 'fixture-course', companyId, title: 'agent基础', perspective: 'learner', canManage: manager }
const spaces = { spaces: params.has('noCourse') ? [] : [space], activeSpace: params.has('noCourse') ? undefined : space,
  loading: false, error: '', pending: false, reload: async () => {}, select: async () => {} }
createRoot(document.getElementById('root')!).render(<ThemeProvider attribute={['class', 'data-theme']} forcedTheme={params.get('theme') || 'light'}><TooltipProvider><DesktopApp learningSpaces={spaces} />
  {params.has('switchCompany') && <button style={{ position: 'fixed', top: 12, right: 24, zIndex: 100 }} onClick={() => useAuth.setState({ activeCompanyId: 'case-fixture-other' })}>切换验收组织</button>}
</TooltipProvider></ThemeProvider>)
