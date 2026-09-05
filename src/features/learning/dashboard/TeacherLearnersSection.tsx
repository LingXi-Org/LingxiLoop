import { SearchIcon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { userFacingError } from '@/lib/userFacingError'
import { learningApi } from '../api'
import type { TeacherLearnerSummary } from '../contracts'

const PAGE_SIZE = 20

function dateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('zh-CN') : '尚无记录'
}

interface TeacherLearnersSectionProps {
  projectId: string
  refreshToken: number
  onOpenLearner(learnerId: string): void
}

export function TeacherLearnersSection({
  projectId,
  refreshToken,
  onOpenLearner,
}: TeacherLearnersSectionProps) {
  const [learners, setLearners] = useState<TeacherLearnerSummary[]>([])
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const searchRef = useRef('')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const currentCursor = cursorStack[pageIndex]

  useEffect(() => {
    setCursorStack([undefined])
    setPageIndex(0)
    setQuery('')
    setSearch('')
    searchRef.current = ''
    setAttentionOnly(false)
  }, [projectId])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextSearch = query.trim()
      if (searchRef.current === nextSearch) return
      searchRef.current = nextSearch
      setSearch(nextSearch)
      setCursorStack([undefined])
      setPageIndex(0)
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void learningApi
      .listLearners(projectId, {
        cursor: currentCursor,
        limit: PAGE_SIZE,
        attentionOnly,
        search: search || undefined,
      })
      .then((page) => {
        if (!active) return
        setLearners(page.data)
        setNextCursor(page.nextCursor)
      })
      .catch((reason) => {
        if (active) setError(userFacingError(reason, '学习者列表暂时无法加载，请稍后重试。'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [attentionOnly, currentCursor, projectId, refreshToken, search])

  const nextPage = () => {
    if (!nextCursor) return
    setCursorStack((current) => [...current.slice(0, pageIndex + 1), nextCursor])
    setPageIndex((current) => current + 1)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>课程学习者</CardTitle>
        <CardDescription>搜索学习者，或聚焦现有记录标记出的关注项。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <InputGroup className="min-w-0 basis-56 flex-1 bg-input/50">
            <InputGroupAddon>
              <HugeiconsIcon icon={SearchIcon} strokeWidth={2} className="size-4 opacity-50" />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索全部学习者"
              aria-label="搜索全部学习者"
            />
          </InputGroup>
          <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-3xl bg-input/50 px-3 text-sm">
            <Checkbox
              checked={attentionOnly}
              onCheckedChange={(checked) => {
                setAttentionOnly(checked === true)
                setCursorStack([undefined])
                setPageIndex(0)
              }}
            />
            只看需要关注
          </label>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading ? (
          <ResourceSkeleton variant="table" count={6} label="正在加载课程学习者" />
        ) : learners.length === 0 ? (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{search || attentionOnly ? '没有找到符合条件的学习者' : '还没有学习者记录'}</EmptyTitle>
              <EmptyDescription>
                {search || attentionOnly ? '调整搜索词或关注筛选后再试。' : '学习者加入并开始学习后会显示在这里。'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>学习者</TableHead>
                  <TableHead>掌握等级</TableHead>
                  <TableHead>已验证目标</TableHead>
                  <TableHead>到期复习</TableHead>
                  <TableHead>证据尝试</TableHead>
                  <TableHead>最近尝试</TableHead>
                  <TableHead>
                    <span className="sr-only">操作</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {learners.map((learner) => (
                  <TableRow key={learner.learnerId}>
                    <TableCell>
                      <p className="font-medium">{learner.displayName}</p>
                      <p className="text-xs text-muted-foreground">{learner.email}</p>
                      {learner.attentionReasons.length > 0 && (
                        <Badge variant="outline" className="mt-1">
                          需要关注
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">掌握等级 {learner.averageLevel.toFixed(1)}</TableCell>
                    <TableCell className="tabular-nums">{learner.verifiedObjectives}</TableCell>
                    <TableCell className="tabular-nums">{learner.dueReviews}</TableCell>
                    <TableCell className="tabular-nums">{learner.attemptCount}</TableCell>
                    <TableCell>{dateTime(learner.lastAttemptAt)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenLearner(learner.learnerId)}
                      >
                        查看
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination className="mt-5">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    aria-disabled={pageIndex === 0}
                    className={pageIndex === 0 ? 'pointer-events-none opacity-50' : undefined}
                    onClick={(event) => {
                      event.preventDefault()
                      if (pageIndex > 0) setPageIndex((current) => current - 1)
                    }}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="px-3 text-sm text-muted-foreground">第 {pageIndex + 1} 页</span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    aria-disabled={!nextCursor}
                    className={!nextCursor ? 'pointer-events-none opacity-50' : undefined}
                    onClick={(event) => {
                      event.preventDefault()
                      nextPage()
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </>
        )}
      </CardContent>
    </Card>
  )
}
