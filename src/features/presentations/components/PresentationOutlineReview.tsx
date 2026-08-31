import { CheckmarkCircle02Icon, SourceCodeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import {
  PRESENTATION_VISUAL_LABELS,
  type PresentationDetailV1,
  type PresentationPageKind,
} from '../contracts'

const PAGE_KIND_LABELS: Record<PresentationPageKind, string> = {
  opening: '开场',
  content: '正文',
  sources: '资料索引',
  closing: '结语',
}

export function PresentationOutlineReview({
  presentation,
  approving,
  onApprove,
}: {
  presentation: PresentationDetailV1
  approving: boolean
  onApprove: () => void
}) {
  const outline = presentation.outline
  if (!outline) return null
  const coveragePercent = Math.round(Math.max(0, Math.min(1, outline.sourceCoverage.coverageRatio)) * 100)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto grid w-full max-w-5xl gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>{outline.title}</CardTitle>
              <CardDescription>{outline.subtitle || outline.objective}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-muted-foreground">计划页数</dt><dd className="mt-1 font-medium">{outline.targetPageCount} 页</dd></div>
                <div><dt className="text-xs text-muted-foreground">受众</dt><dd className="mt-1 line-clamp-2 font-medium">{outline.audience || '一般读者'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">语言</dt><dd className="mt-1 font-medium">{outline.language || '中文'}</dd></div>
              </dl>
              <Progress value={coveragePercent} max={100} aria-label="资料覆盖率">
                <ProgressLabel>资料覆盖率</ProgressLabel>
                <ProgressValue />
              </Progress>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-heading text-sm font-medium">章节与页面</h3>
              <p className="mt-1 text-xs text-muted-foreground">检查叙事顺序、逐页结论和视觉形式。</p>
            </div>
            <Badge variant="outline">{outline.sections.length} 个章节</Badge>
          </div>

          <Accordion type="multiple">
            {outline.sections.map((section, sectionIndex) => (
              <AccordionItem key={section.id} value={section.id}>
                <AccordionTrigger>
                  <span className="min-w-0">
                    <span className="block truncate">{sectionIndex + 1}. {section.title}</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {section.pages.length} 页 · {section.summary || section.objective}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ol className="grid gap-2">
                    {section.pages.map((page) => (
                      <li key={page.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 rounded-xl bg-card p-3 ring-1 ring-border/60">
                        <span className="grid size-8 place-items-center rounded-lg bg-muted text-xs font-semibold tabular-nums">{page.pageNumber}</span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-foreground">{page.title}</span>
                            <Badge variant="outline">{PAGE_KIND_LABELS[page.kind]}</Badge>
                            <Badge variant="outline">{PRESENTATION_VISUAL_LABELS[page.visualType]}</Badge>
                            {page.kind === 'content' && <Badge variant="outline">{page.zoomPointCount} 个讲解点</Badge>}
                          </div>
                          {page.conclusion && <p className="mt-1 text-xs leading-5 text-muted-foreground">{page.conclusion}</p>}
                          <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <HugeiconsIcon icon={SourceCodeIcon} strokeWidth={2} className="size-3" />
                            {page.sourceIds.length} 份资料 · {page.evidenceIds.length} 条证据
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-3 border-t border-[var(--im-divider-weak)] bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs leading-5 text-muted-foreground">批准后将按这份大纲生成并检查全部页面。需要调整时，可直接在群聊中说明。</p>
        <Button type="button" onClick={onApprove} disabled={approving} className="shrink-0">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} data-icon="inline-start" />
          {approving ? '正在批准…' : '批准大纲并开始生成'}
        </Button>
      </div>
    </div>
  )
}
