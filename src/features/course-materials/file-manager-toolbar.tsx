// Adapted from Studio Admin, MIT © 2024 Mohammed Arham Khan.
// Fixed source and changes: third_party/studio-admin/README.md.
import { ArrowUpDown, Search, SlidersHorizontal, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { SelectField } from '@/components/ui/select-field'
import { fileKindLabels, type MaterialFormat, type MaterialSort, materialSortLabels } from './data'

export function FileManagerToolbar({ search, format, sort, onSearch, onFormat, onSort, onUpload, uploadLabel }: {
  search: string; format: MaterialFormat; sort: MaterialSort
  onSearch(value: string): void; onFormat(value: MaterialFormat): void; onSort(value: MaterialSort): void
  onUpload?: () => void; uploadLabel: string
}) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
      <InputGroup className="border-border bg-background md:max-w-lg">
        <InputGroupInput type="search" placeholder="搜索文件名称或上传教师…" aria-label="搜索课程资料" value={search} onChange={event => onSearch(event.target.value)} />
        <InputGroupAddon><Search /></InputGroupAddon>
      </InputGroup>
      <div className="flex flex-1 flex-wrap items-center gap-2 xl:justify-end">
        <SelectField ariaLabel="资料格式" className="w-36" value={format} onValueChange={onFormat}
          options={[{ value: 'all', label: '全部格式' }, ...Object.entries(fileKindLabels).map(([value, label]) => ({ value: value as MaterialFormat, label }))]} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" className="h-9"><SlidersHorizontal />筛选与排序</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel><ArrowUpDown className="me-2 inline size-4" />排序方式</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sort} onValueChange={value => onSort(value as MaterialSort)}>
                {Object.entries(materialSortLabels).map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>格式</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={format} onValueChange={value => onFormat(value as MaterialFormat)}>
                <DropdownMenuRadioItem value="all">全部格式</DropdownMenuRadioItem>
                {Object.entries(fileKindLabels).map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {onUpload && <Button onClick={onUpload} className="h-9 gap-2"><Upload />{uploadLabel}</Button>}
      </div>
    </div>
  )
}
