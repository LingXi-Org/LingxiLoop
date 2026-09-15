import { recordPath } from './workspace-model'
import { ImageIcon } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { fieldLabel, formatValue, IMAGE_FIELDS, recordImage, recordTitle, safeImageUrl, STATUS_LABELS, statusTone, type AdminRecord } from './record-presentation'

export function StatusBadge({ value }: { value: unknown }) {
  const status = String(value ?? 'unknown')
  return <Badge variant="outline" className="admin-status-badge" data-tone={statusTone(value)}><span className="size-1.5 rounded-full bg-current" />{STATUS_LABELS[status.toLowerCase()] ?? status}</Badge>
}

export function RecordAvatar({ record }: { record: AdminRecord }) {
  const title = recordTitle(record)
  return <Avatar className="size-10"><AvatarImage src={recordImage(record)} alt={title} referrerPolicy="no-referrer" /><AvatarFallback className="bg-primary/10 font-semibold text-primary">{Array.from(title).slice(0, 2).join('').toUpperCase()}</AvatarFallback></Avatar>
}

export function RecordCover({ record }: { record: AdminRecord }) {
  const src = recordImage(record)
  const [failed, setFailed] = React.useState(false)
  return <div className="admin-record-cover">{src && !failed ? <img src={src} alt={recordTitle(record)} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <><ImageIcon className="size-7" /><span>暂无封面</span></>}</div>
}

const RELATIONS: Record<string, string> = { company_id: 'companies', project_id: 'projects', user_id: 'users', agent_id: 'participants', source_id: 'knowledge-sources', activity_id: 'learning-activities', attempt_id: 'learning-attempts' }

export function RecordValue({ value, field = '', depth = 0, label }: { value: unknown; field?: string; depth?: number; label?: string }) {
  if (value == null || value === '') return <span className="text-muted-foreground">—</span>
  if (['status', 'transport_status', 'role'].includes(field)) return <StatusBadge value={value} />
  if (['kind', 'type'].includes(field) && typeof value === 'string') return <span>{STATUS_LABELS[value.toLowerCase()] ?? value}</span>
  if (IMAGE_FIELDS.includes(field) && safeImageUrl(value)) return <RecordCover key={String(value)} record={{ id: field, title: fieldLabel(field), image: value }} />
  if (RELATIONS[field] && typeof value === 'string') return <Link className="admin-record-link break-all" to={recordPath(RELATIONS[field], value)}>{label ?? value}</Link>
  if (typeof value === 'object') {
    if (depth >= 3) return <details><summary className="cursor-pointer text-sm text-muted-foreground">{formatValue(value)} · 展开原始数据</summary><pre className="admin-json mt-2">{JSON.stringify(value, null, 2)}</pre></details>
    if (Array.isArray(value)) return value.length ? <ul className="space-y-3">{value.map((item, index) => <li key={index} className="rounded-lg border p-3"><RecordValue value={item} depth={depth + 1} /></li>)}</ul> : <span className="text-muted-foreground">暂无内容</span>
    return <dl className="admin-properties">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{fieldLabel(key)}</dt><dd><RecordValue field={key} value={item} depth={depth + 1} /></dd></div>)}</dl>
  }
  return <span className="whitespace-pre-wrap break-words">{formatValue(value, field)}</span>
}
