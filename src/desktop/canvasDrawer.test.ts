import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const desktop = readFileSync(new URL('./DesktopApp.tsx', import.meta.url), 'utf8')
const chat = readFileSync(new URL('./ChatPane.tsx', import.meta.url), 'utf8')
const context = readFileSync(new URL('../components/GroupContextContent.tsx', import.meta.url), 'utf8')
const sources = readFileSync(new URL('../components/WorkspaceChrome.tsx', import.meta.url), 'utf8')
const canvasHeader = readFileSync(new URL('../features/canvas/components/CanvasHeader.tsx', import.meta.url), 'utf8')
const canvasStyles = readFileSync(new URL('../features/canvas/canvas.css', import.meta.url), 'utf8')

test('desktop consumes the existing Canvas surface in a full-size shadcn Dialog', () => {
  assert.match(desktop, /surface\?\.kind === 'canvas' \? surface\.canvasId : null/)
  assert.match(desktop, /<Dialog open=\{Boolean\(canvasId\)\}/)
  assert.match(desktop, /<DialogContent showCloseButton=\{false\}[\s\S]*?max-w-none[\s\S]*?<CanvasView canvasId=\{canvasId\} onBack=\{closeCanvasView\} \/>/)
  assert.match(desktop, /<ResizablePanel id="context"[\s\S]*?CONTEXT_COLUMN_MIN[\s\S]*?CONTEXT_COLUMN_MAX/)
  assert.doesNotMatch(desktop, /contextOpen = Boolean\(canvasId|drawerOpen = Boolean\([^)]+canvasId/)
})

test('Canvas back returns focus to its workspace trigger', () => {
  assert.match(desktop, /const closeCanvasView = \(\) => \{[\s\S]*?closeCanvasPeek\(\)[\s\S]*?data-canvas-open-trigger[\s\S]*?\.focus\(\{ preventScroll: true \}\)[\s\S]*?setTimeout/)
})

test('conversation header uses one accessible workspace toggle instead of search', () => {
  assert.doesNotMatch(chat, /aria-label="搜索当前会话"/)
  assert.match(chat, /PanelRightCloseIcon : PanelRightOpenIcon/)
  assert.match(chat, /aria-expanded=\{groupContextOpen\}/)
  assert.doesNotMatch(chat, /conversation\.kind === 'group'/)
  assert.match(desktop, /onToggleGroupContext=\{\(\) => setGroupContextOpen/)
})

test('selecting a conversation automatically expands the context workspace', () => {
  assert.match(desktop, /useEffect\(\(\) => \{ setGroupContextOpen\(Boolean\(selectedConversation\)\) \}, \[selectedConversation\?\.id\]\)/)
})

test('conversation and dashboard sidebars share one stable pixel width', () => {
  const dashboard = readFileSync(new URL('./PersonalDashboard.tsx', import.meta.url), 'utf8')
  assert.match(desktop, /LEFT_COLUMN_DEFAULT = 260/)
  assert.match(desktop, /defaultSize=\{sidebarWidth\}[\s\S]*?groupResizeBehavior="preserve-pixel-size"/)
  assert.match(dashboard, /defaultSize=\{sidebarWidth\}[\s\S]*?groupResizeBehavior="preserve-pixel-size"/)
  assert.doesNotMatch(desktop, /TWO_PANEL_DEFAULT_LAYOUT|THREE_PANEL_DEFAULT_LAYOUT/)
})

test('workspace strip reuses the rail CourseAvatar instead of a static text avatar', () => {
  assert.match(desktop, /<CourseAvatar courseId=\{activeWorkspace\.id\} title=\{activeWorkspace\.name\}/)
  assert.doesNotMatch(desktop, /<AvatarFallback[\s\S]*?>\s*学\s*</)
})

test('context workspace keeps the stacked split and uses the shadcn Button primitive', () => {
  assert.match(context, /grid-rows-\[minmax\(0,38fr\)_minmax\(0,62fr\)\]/)
  assert.match(context, /<Button type="button" variant="outline"[\s\S]*?aria-label="打开完整画布"/)
  assert.doesNotMatch(context, /CardSurface|<Tabs/)
})

test('Canvas and source empty states use the installed shadcn Empty composition', () => {
  for (const source of [context, sources]) {
    assert.match(source, /<Empty[\s\S]*?<EmptyHeader>[\s\S]*?<EmptyMedia variant="icon">[\s\S]*?<EmptyTitle[\s\S]*?<EmptyDescription>[\s\S]*?<EmptyContent/)
  }
  assert.doesNotMatch(context, /place-items-center px-8 pb-12/)
  assert.doesNotMatch(sources, /context-empty-action/)
})

test('Canvas is ensured per conversation without a manual creation action', () => {
  assert.match(context, /ensureForConversation\(conversationId\)/)
  assert.doesNotMatch(context, /新建画布|PlusSignIcon|createForConversation/)
})

test('large Canvas chrome uses shadcn controls while frame hosts keep only the inner sketch border', () => {
  assert.match(canvasHeader, /variant="outline" size="icon-sm"[\s\S]*?aria-label="返回对话"[\s\S]*?rounded-full/)
  assert.doesNotMatch(canvasHeader, /snapshot\?\.title|结构化报告|共同工作的可视空间/)
  assert.match(canvasHeader, /data-canvas-timeline[\s\S]*?rounded-xl border bg-card shadow-sm/)
  assert.match(canvasHeader, /variant="outline" size="icon"[\s\S]*?工作时间轴/)
  assert.doesNotMatch(canvasStyles, /canvas-(?:title-island|timeline-shell)::(?:before|after)/)
  assert.match(canvasStyles, /\.canvas-frame-card \{[\s\S]*?border: 0;[\s\S]*?box-shadow: none;/)
  assert.match(canvasStyles, /\.canvas-frame-card::before/)
})

test('Canvas menus and dialogs use native shadcn surfaces without sketch overrides', () => {
  const canvasView = readFileSync(new URL('../features/canvas/components/CanvasView.tsx', import.meta.url), 'utf8')
  assert.match(canvasView, /from '@\/components\/ui\/dialog'/)
  assert.match(canvasView, /<DialogContent/)
  assert.match(canvasView, /<ContextMenuContent/)
  assert.doesNotMatch(canvasView, /canvas-(?:context-menu|mini-dialog|dialog-layer|agent-option|primary-action)/)
})

test('empty Canvas guidance scales with the Canvas viewport', () => {
  const canvasView = readFileSync(new URL('../features/canvas/components/CanvasView.tsx', import.meta.url), 'utf8')
  assert.match(canvasView, /pointer-events-none fixed inset-0 grid place-items-center/)
  assert.match(canvasView, /data-canvas-empty[\s\S]*?transform: `scale\(\$\{viewport\.zoom\}\)`/)
  assert.match(canvasStyles, /\.canvas-empty-state \{[\s\S]*?border: 0;[\s\S]*?box-shadow: none;/)
  assert.match(canvasStyles, /\.canvas-empty-state::before/)
})

test('work timeline reserves loading and empty states without handwritten connectors', () => {
  assert.match(canvasHeader, /data-canvas-timeline-state="loading"[\s\S]*?<Skeleton/)
  assert.match(canvasHeader, /data-canvas-timeline-state="empty"[\s\S]*?暂无工作任务/)
  assert.match(canvasHeader, /rounded-lg border border-transparent[\s\S]*?hover:border-border/)
  assert.doesNotMatch(canvasStyles, /canvas-timeline-item \+ \.canvas-timeline-item::before/)
})

test('context resources reserve their layout with ResourceSkeleton during first load', () => {
  assert.match(context, /preparing \? <ResourceSkeleton variant="media" label="正在准备画布"/)
  assert.match(sources, /firstLoadPending \|\| initialLoading \|\| loading/)
  assert.match(sources, /settledConversationId\.current !== conversationId/)
  assert.match(sources, /setInitialLoading\(Boolean\(conversationId && supportsSources\)\)/)
  assert.match(sources, /kind === 'group' \|\| kind === 'direct'/)
  assert.doesNotMatch(sources, /私聊暂不支持资料/)
})
