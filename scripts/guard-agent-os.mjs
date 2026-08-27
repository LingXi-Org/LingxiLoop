#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const root = resolve('.')
const failures = []

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && ['.ts', '.tsx', '.js', '.mjs'].includes(extname(path)) ? [path] : []
  })
}

// This guard deliberately checks active AgentOS composition, not whether
// archived migration/reference directories still exist in the repository.
const activeFiles = [
  ...sourceFiles(join(root, 'server/src/agent-os')),
  join(root, 'server/src/web.ts'),
  join(root, 'server/src/im/router.ts'),
  join(root, 'src/lib/im/wukong.ts'),
  join(root, 'src/stores/messages.ts'),
]

for (const retiredPath of [
  join(root, 'server/lingxigraph'),
  join(root, 'server/docker/agent-computer-lingxiloop-web.sh'),
  join(root, 'server/src/agents/agent-voice.ts'),
  join(root, 'server/src/agents/private_chat.ts'),
  join(root, 'server/src/scripts/migrate-whispers-to-conversations.ts'),
  join(root, 'src/stores/whispers.ts'),
  join(root, 'src/components/WhisperRoom.tsx'),
  join(root, 'src/desktop/WhispersView.tsx'),
  join(root, 'src/mobile/MobileWhispers.tsx'),
]) {
  if (existsSync(retiredPath)) {
    failures.push(`${relative(root, retiredPath).replaceAll('\\', '/')}: retired source path must not exist`)
  }
}

for (const path of activeFiles) {
  const rel = relative(root, path).replaceAll('\\', '/')
  const source = readFileSync(path, 'utf8')
  if (/server\/lingxigraph|(?:from|import\s*\()[^\n]{0,160}lingxigraph/i.test(source)) {
    failures.push(`${rel}: active AgentOS depends on retired LingxiGraph runtime`)
  }
  if (/@openai\/codex|\bcodex\s+exec\b|\bCODEX_HOME\b|BYOA_CODEX|(?:spawn|execFile|exec)\s*\([^\n]{0,200}\bcodex\b/i.test(source)) {
    failures.push(`${rel}: active AgentOS depends on a local Codex CLI/runtime`)
  }
  if (/computer-runtime|user-computer|agent-computer|COMPUTER_RUNTIME_SERVICE_TOKEN|loop\.computer|computer\.(?:input|takeover|screenshot)/i.test(source)) {
    failures.push(`${rel}: active AgentOS depends on retired Computer runtime`)
  }
}

const tool = readFileSync(join(root, 'server/src/agent-os/tool.ts'), 'utf8')
if (!/MODEL_TOOLS[^\n]*Object\.freeze\(\[IPYTHON_TOOL\]\)/.test(tool)) {
  failures.push('AgentOS model-visible tool surface is not exactly IPython')
}

const kernel = readFileSync(join(root, 'server/agent-os/kernel_runner.py'), 'utf8')
const actions = readFileSync(join(root, 'server/src/agent-os/learning-actions.ts'), 'utf8')
const controlPlane = readFileSync(join(root, 'server/src/agent-os/control-plane.ts'), 'utf8')
// Keep the architecture guard deterministic across Windows and POSIX worktrees.
const runtime = readFileSync(join(root, 'server/src/agent-os/runtime.ts'), 'utf8').replaceAll('\r\n', '\n')
const promptAssembly = readFileSync(join(root, 'server/src/agent-os/prompt-assembly.ts'), 'utf8')
const canvasService = readFileSync(join(root, 'server/src/canvas/service.ts'), 'utf8')
const schema = readFileSync(join(root, 'server/src/db/schema.sql'), 'utf8')
const teacherAgent = readFileSync(join(root, 'server/src/learning/teacher-agent.ts'), 'utf8')
if (!/"learning"/.test(kernel) || !/namespace === 'learning'/.test(actions) || !/learning: 'learning'/.test(controlPlane)) {
  failures.push('learning must exist only as a capability-gated loop.learning Host Bridge namespace')
}
if (!/"teacher"/.test(kernel) || !/allowedNamespaces/.test(kernel)
  || !/namespace === 'teacher'/.test(actions) || !/teacher: 'teacher_admin'/.test(controlPlane)) {
  failures.push('Pulse must be capability-gated through the loop.teacher Host Bridge namespace')
}
if (!runtime.includes("allowedNamespaces: ['teacher', 'turn']")
  || !runtime.includes('teacherAgent\n        ?') || !runtime.includes('teacherContextContract')) {
  failures.push('Pulse IPython must expose only teacher/turn and use a dedicated transient contract')
}
if (!teacherAgent.includes("PULSE_CAPABILITIES = ['teacher_admin']")
  || !teacherAgent.includes("JSON.stringify(['ipython'])")
  || /loop\.learning/.test(teacherAgent)) {
  failures.push('Pulse identity must remain product-managed with tools=[ipython] and no learner SDK')
}
if (!controlPlane.includes("namespace === 'teacher'") || !controlPlane.includes('teacher_managed')) {
  failures.push('ordinary agents must be deterministically blocked from teacher.*')
}
for (const table of ['learning_project_teacher_agents','learning_course_teacher_rooms']) {
  if (!schema.includes(`CREATE TABLE public.${table}`)) failures.push(`missing durable Pulse relation ${table}`)
}
if (!runtime.includes('finish_planning') || !actions.includes('planning gate blocked')) {
  failures.push('learning must retain the Frontier-style planning gate')
}
if (!promptAssembly.includes('ef326d07207e8ab4adacfa63861f7a76813192b5')
  || !promptAssembly.includes('a7c186f5ccac95875c0041aed60398f6ecb6d6c7')
  || !promptAssembly.includes('<policy>')) {
  failures.push('prompt assembly must retain its pinned FrontierAgent/grok-prompts structure')
}
if (/classifyAgent|agentName.*(?:match|test)|(?:match|test).*agentName/.test(promptAssembly)) {
  failures.push('execution roles must never be inferred from Agent names')
}
if (!promptAssembly.includes('executionRole') || !runtime.includes("work.reason === 'canvas_summary'")) {
  failures.push('task-scoped execution roles and reporter phase must remain explicit')
}
if (!actions.includes('submit_report') || !canvasService.includes('assertCanvasWorkReportReady')
  || !canvasService.includes('learning_report_v1')) {
  failures.push('Canvas completion must be gated by a persisted structured report')
}
if (!schema.includes('canvas_assignment_verifier_not_self_check')
  || !canvasService.includes('builder and verifier must be different agents')) {
  failures.push('builder/verifier separation must be enforced by Host and database')
}
if (!schema.includes('progress_fingerprint') || !controlPlane.includes('no_progress_count')) {
  failures.push('durable no-progress detection must remain enabled')
}
const currentProductSurface = [
  readFileSync(join(root, 'server/src/api/router.ts'), 'utf8'),
  readFileSync(join(root, 'server/src/modules/conversations/service.ts'), 'utf8'),
  readFileSync(join(root, 'src/api/contracts.ts'), 'utf8'),
  readFileSync(join(root, 'src/types.ts'), 'utf8'),
].join('\n')
if (/peek\/agent-chats|ApiWhisper|whisper-link|kind\s*===?\s*['"]whisper['"]/.test(currentProductSurface)) {
  failures.push('retired Whispers/agent-side-channel product path must not return')
}
for (const path of [...activeFiles, ...sourceFiles(join(root, 'server/src/learning'))]) {
  const source = readFileSync(path, 'utf8')
  if (/\bAgentBus\b|agent[_-]?bus/i.test(source)) failures.push(`${relative(root, path).replaceAll('\\', '/')}: AgentBus is forbidden`)
}

if (failures.length > 0) {
  console.error(['Agent OS architecture guard failed:', ...failures.map((failure) => `- ${failure}`)].join('\n'))
  process.exit(1)
}
console.log('Agent OS architecture guard passed: no legacy runtime, Codex CLI, or Computer runtime dependencies; tools = [ipython].')
