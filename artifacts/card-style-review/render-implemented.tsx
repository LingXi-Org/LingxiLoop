import { writeFileSync, readdirSync, readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ApprovalCard } from '../../src/components/assistant-ui/elements/approval-card'
import { AttachmentCard } from '../../src/components/assistant-ui/elements/attachment-card'
import { ArtifactCard } from '../../src/components/assistant-ui/elements/artifact-card'
import { PollCard } from '../../src/components/assistant-ui/elements/poll-card'
import { ProgressCard } from '../../src/components/assistant-ui/elements/progress-card'
import { DeliveryCard } from '../../src/features/chat/components/RunResultCards'
import { PresentationIcon, PanelsTopLeftIcon } from 'lucide-react'

const cards = [
  <ProgressCard title="处理进度" steps={[{ id: 'reasoning', label: '思考过程', status: 'running', detail: '正在整理协作需求、检索能力和维护成本的对比。' }]} />,
  <DeliveryCard artifacts={[{ path: '/workspace/项目周报.pdf', size: 1024000, mime: 'application/pdf', sha256: '0'.repeat(64) }, { path: '/workspace/进度明细.xlsx', size: 86000, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sha256: '0'.repeat(64) }]} busy={false} onDownload={() => {}} />,
  <AttachmentCard filename="需求说明.pdf" data="https://example.com/report.pdf" sourceType="url" mimeType="application/pdf" />,
  <PollCard title="产品评审时间" multiple={false} value={['b']} options={[{ value: 'a', label: '周二 10:00', description: '30 分钟' }, { value: 'b', label: '周三 14:00', description: '30 分钟' }]} submitted={false} closed={false} onChange={() => {}} onSubmit={() => {}} />,
  <ArtifactCard title="新用户旅程" meta="4 个内容区" icon={<PanelsTopLeftIcon />} preview={<div className="grid h-full place-items-center p-5 text-sm text-muted-foreground">画布内容预览区域</div>} onOpen={() => {}} openLabel="打开画布" />,
  <ArtifactCard title="用户调研汇报" meta="12 页 · 已生成" icon={<PresentationIcon />} preview={<div className="flex h-full flex-col justify-center p-5"><p className="text-xs text-muted-foreground">演示封面预览区域</p><p className="mt-2 text-xl font-semibold">理解用户，让协作自然发生。</p></div>} onOpen={() => {}} openLabel="打开演示" />,
  <ApprovalCard title="任务审批" summary="发送项目周报" context={[{ label: '执行者', value: '灵犀助手' }, { label: '收件人', value: 'team@example.com' }, { label: '主题', value: '本周项目进展' }, { label: '附件', value: '项目周报.pdf' }]} onApprove={() => {}} onDeny={() => {}} />,
  <ProgressCard title="任务结果" steps={[{ id: 'execution', label: '执行任务', status: 'complete' }, { id: 'result', label: '准备交付', status: 'complete', detail: '答复已生成' }, { id: 'delivery', label: '投递到会话', status: 'failed', detail: '投递未完成，可重试投递。' }]} />,
]
const labels = ['1B 思考过程', '2B 任务交付', '3B 消息附件', '4B 投票', '6B 协作画布', '7B 演示文稿', '8B 操作审批', '9B 任务失败']
const html = renderToStaticMarkup(<main className="mx-auto max-w-6xl p-6"><h1 className="mb-2 text-2xl font-semibold">已落地组件 · B 方案</h1><p className="mb-8 text-sm text-muted-foreground">实际 React 组件与生产主题 CSS；示例数据用于视觉核对，操作不可用。</p><div className="grid gap-6 md:grid-cols-2">{cards.map((card,i) => <section key={labels[i]} className="rounded-xl border border-border bg-background p-5"><h2 className="mb-5 text-sm font-medium">{labels[i]}</h2><div className="mb-1 w-fit rounded-[18px_18px_18px_6px] bg-muted px-3 py-2 text-sm">已根据你的需求整理好。</div>{card}<div className="mt-1 w-fit rounded-[6px_18px_18px_18px] bg-muted px-3 py-2 text-sm">你可以继续查看详情。</div></section>)}</div></main>)
const css = readdirSync('dist/assets').filter(name => name.endsWith('.css')).map(name => readFileSync(`dist/assets/${name}`, 'utf8')).join('\n')
writeFileSync('artifacts/card-style-review/implemented.html', `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>已落地卡片预览</title><style>${css}html,body{height:auto;overflow:auto}</style><body class="bg-background text-foreground">${html}</body></html>`)
