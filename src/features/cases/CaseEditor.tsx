import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, Clock, Plus, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ContentEditor } from '@/features/content-editor'
import { userFacingError } from '@/lib/userFacingError'
import { markdownText } from '@/features/content-editor/document'
import type { CaseInput, CaseOptions } from './api'
import { CaseCover } from './CaseCover'
import { coverColors, coverDesign, type CoverColor } from './cover-design'

export function CaseEditor({ input, options, preview, busy, authorName, authorAvatar, onChange, onCreateCollege, onEditSummary, uploadFile, children }: {
  input: CaseInput
  options: CaseOptions
  preview: boolean
  busy: boolean
  authorName: string
  authorAvatar?: string | null
  onChange(change: (input: CaseInput) => CaseInput): void
  onCreateCollege(name: string): Promise<void>
  onEditSummary(): void
  uploadFile(file: File): Promise<string>
  children: ReactNode
}) {
  const [collegeOpen, setCollegeOpen] = useState(false)
  const [collegeQuery, setCollegeQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [collegeError, setCollegeError] = useState('')
  const colleges = [...new Set([...(input.college ? [input.college] : []), ...options.colleges])]
  const categories = [...new Set([...(input.category ? [input.category] : []), ...options.categories])]
  const createCollege = async () => {
    if (!collegeQuery.trim() || creating || busy) return
    setCreating(true); setCollegeError('')
    try { await onCreateCollege(collegeQuery.trim()); setCollegeOpen(false); setCollegeQuery('') }
    catch (reason) { setCollegeError(userFacingError(reason, '学院未创建，请重试。')) }
    finally { setCreating(false) }
  }
  const summary = markdownText(input.summary)
  const text = markdownText(input.body)
  const cover = <CaseCover title={input.title} coverText={input.coverText} coverColor={input.coverColor}/>
  return <div className={`case-compose-layout ${preview ? 'case-compose-preview' : ''}`}>
    <section className="case-compose-scroll" aria-label={preview ? '案例预览' : '编辑案例'}>
      <div className="case-edit-document" hidden={preview}>
        <Textarea className="case-edit-title" aria-label="案例标题" placeholder="案例标题" rows={1} maxLength={200} required disabled={busy} value={input.title} onChange={event => onChange(value => ({ ...value, title: event.target.value }))}/>
        <Textarea id="case-summary-input" className="case-edit-summary" aria-label="一句话简介" placeholder="一句话简介，会显示在案例卡片上" rows={1} maxLength={2000} disabled={busy} value={input.summary} onChange={event => onChange(value => ({ ...value, summary: event.target.value, summaryDocument: null }))}/>
        <div className="case-inline-editor case-compose-body"><ContentEditor purpose="case" legacyFormat="markdown" label="正文" value={input.body} document={input.editorDocument} maxLength={200000} disabled={busy} uploadFile={uploadFile} onChange={(body, editorDocument) => onChange(value => ({ ...value, body, editorDocument }))}/></div>
      </div>
      {preview && <article className="case-preview-document case-reader">
        {input.category && <div className="case-reader-tags"><span>{input.category}</span></div>}
        <h1>{input.title.trim() || '未填写标题'}</h1>
        <div className="case-reader-author"><Avatar><AvatarImage src={authorAvatar ?? undefined} alt=""/><AvatarFallback>{authorName.slice(0, 1)}</AvatarFallback></Avatar><span>{authorName}</span>{input.college && <><span aria-hidden="true">·</span><span>{input.college}</span></>}<span aria-hidden="true">·</span><span>未发布</span></div>
        <div className="case-preview-cover">{cover}</div>
        <div data-case-body className="case-body">{children}</div>
      </article>}
    </section>
    {!preview ? <aside className="case-compose-settings" aria-label="案例设置">
      <div className="case-setting"><label htmlFor="case-cover-text">封面</label><div className="case-setting-cover">{cover}</div>
        <Input id="case-cover-text" aria-label="封面文字" maxLength={24} disabled={busy} placeholder={coverDesign(input).text} value={input.coverText ?? ''} onChange={event => onChange(value => ({ ...value, coverText: event.target.value }))}/>
        <div role="group" aria-label="封面配色" className="case-cover-colors">{(Object.keys(coverColors) as CoverColor[]).map(color => <button type="button" key={color} aria-label={`${coverColors[color].label}封面`} aria-pressed={(input.coverColor ?? 'blue') === color} disabled={busy} style={{ backgroundColor: coverColors[color].swatch }} onClick={() => onChange(value => ({ ...value, coverColor: color }))}/>)}</div>
      </div>
      <div className="case-setting"><label htmlFor="case-category-select">分类</label>
        <Select value={input.category || undefined} disabled={busy} onValueChange={category => onChange(value => ({ ...value, category }))}><SelectTrigger id="case-category-select" aria-label="分类"><SelectValue placeholder="选择分类"/></SelectTrigger><SelectContent>{categories.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}{categories.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">请先在案例首页添加分类</p>}</SelectContent></Select>
      </div>
      <div className="case-setting"><span id="case-college-label">学院</span>
        <Popover open={collegeOpen} onOpenChange={open => { if (!creating) { setCollegeOpen(open); setCollegeError('') } }}><PopoverTrigger asChild><Button type="button" variant="outline" className="case-college-trigger" disabled={busy} aria-labelledby="case-college-label" aria-expanded={collegeOpen}><span>{input.college || '选择或创建学院'}</span><ChevronDown aria-hidden="true"/></Button></PopoverTrigger>
          <PopoverContent align="end" className="w-[var(--radix-popover-trigger-width)] p-1"><Command shouldFilter={false}>
            <CommandInput aria-label="搜索或创建学院" placeholder="搜索或创建学院" maxLength={80} value={collegeQuery} onValueChange={setCollegeQuery} disabled={creating}/>
            <CommandList>{colleges.filter(name => name.toLocaleLowerCase().includes(collegeQuery.trim().toLocaleLowerCase())).map(name => <CommandItem key={name} value={name} disabled={creating} onSelect={() => { onChange(value => ({ ...value, college: name })); setCollegeOpen(false); setCollegeQuery('') }}><span className="min-w-0 flex-1 break-words">{name}</span>{input.college === name && <Check aria-hidden="true"/>}</CommandItem>)}
              {collegeQuery.trim() && !colleges.includes(collegeQuery.trim()) && <CommandItem value={`create:${collegeQuery}`} disabled={creating} onSelect={() => void createCollege()}><Plus aria-hidden="true"/>{creating ? '正在创建…' : `创建“${collegeQuery.trim()}”`}</CommandItem>}
              {!collegeQuery && !colleges.length && <p className="p-3 text-xs text-muted-foreground">输入学院名称即可创建</p>}
            </CommandList>
          </Command>{collegeError && <p role="alert" className="p-2 text-sm text-destructive">{collegeError}</p>}</PopoverContent>
        </Popover>
      </div>
    </aside> : <aside className="case-compose-settings case-preview-settings" aria-label="发布前检查">
      <section className="case-setting"><span>在案例库中显示为</span><div className="case-preview-card"><div className="case-preview-card-cover">{cover}</div><div className="case-preview-card-copy"><h2>{input.title.trim() || '未填写标题'}</h2><p className={summary ? '' : 'italic'}>{summary || '（暂无简介）'}</p><small>{authorName} · 未发布</small></div></div></section>
      <hr/>
      <section className="case-preview-checks"><h2>发布前检查</h2>
        <div>{input.title.trim() && input.category ? <Check aria-hidden="true"/> : <TriangleAlert aria-hidden="true"/>}<span>{input.title.trim() && input.category ? '标题、封面和分类已设置' : !input.title.trim() ? '请填写案例标题' : '尚未选择分类'}</span></div>
        {summary ? <div><Check aria-hidden="true"/><span>一句话简介已填写</span></div> : <div><TriangleAlert aria-hidden="true"/><span>缺少一句话简介，列表卡片会显示为空</span><button type="button" onClick={onEditSummary}>去填写</button></div>}
        <div><Clock aria-hidden="true"/><span>{text.trim() ? `正文约 ${Math.max(1, Math.ceil(text.replace(/\s/g, '').length / 400))} 分钟读完` : '请填写正文后再发布'}</span></div>
      </section>
    </aside>}
  </div>
}
