import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
const runtime = readFileSync(new URL('../agent-os/runtime.ts', import.meta.url), 'utf8')
const actions = readFileSync(new URL('../agent-os/learning-actions.ts', import.meta.url), 'utf8')
const service = readFileSync(new URL('../learning/service.ts', import.meta.url), 'utf8')
const repository = readFileSync(new URL('../modules/learning/repository.ts', import.meta.url), 'utf8')
const kernel = readFileSync(new URL('../../agent-os/kernel_runner.py', import.meta.url), 'utf8')

function productionTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__integration__' || entry.name === 'learning') return []
      return productionTypeScriptFiles(path)
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : []
  })
}

test('production consumers use only public Learning capability surfaces', () => {
  const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const violations = productionTypeScriptFiles(serverRoot)
    .filter((path) => !relative(serverRoot, path).replaceAll('\\', '/').startsWith('modules/learning/'))
    .flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      return /(?:from\s+|import\(\s*)['"][^'"]*\/learning\/(?!runtime\.js|access\.js|worker\.js|preset\.js|router\.js)[^'"]+['"]/.test(source)
        ? [relative(serverRoot, path)]
        : []
    })
  assert.deepEqual(violations, [])
})

test('native learning schema keeps evidence, projection and delivery ledgers durable', () => {
  for (const table of ['courses','course_members','learning_course_rooms','learning_objectives','learning_activities',
    'learning_missions','learning_mission_steps','learning_attempts','learning_evaluations','learning_mastery','learning_mastery_events','learning_notification_deliveries',
    'learning_project_teacher_agents','learning_course_teacher_rooms']) {
    assert.match(schema, new RegExp(`CREATE TABLE public\\.${table}\\b`))
  }
  assert.match(schema, /num_nonnulls\(activity_id, mission_step_id\) = 1/)
  assert.match(schema, /UNIQUE \(course_id, learner_id, conversation_id, trigger_client_msg_no\)/)
  assert.match(schema, /uq_learning_deliveries_course/)
  assert.doesNotMatch(schema, /CREATE TABLE public\.learning_(?:courses|course_memberships)\b/)
})

test('objective persistence has one tenant-scoped repository path', () => {
  assert.doesNotMatch(service, /INSERT INTO learning_objectives/)
  assert.doesNotMatch(service, /UPDATE learning_objectives SET status/)
  assert.match(repository, /course\.id=\$2 AND course\.company_id=\$3/)
  assert.match(repository, /objective\.course_id=\$2 AND objective\.company_id=\$1/)
})

test('Pulse is Project-scoped, teacher-room-scoped and IPython namespace restricted',()=>{
  const teacher=readFileSync(new URL('../learning/teacher-agent.ts',import.meta.url),'utf8')
  const control=readFileSync(new URL('../agent-os/control-plane.ts',import.meta.url),'utf8')
  assert.match(teacher,/PULSE_CAPABILITIES = \['teacher_admin'\]/)
  assert.match(teacher,/JSON\.stringify\(\['ipython'\]\)/)
  assert.match(teacher,/learning_project_teacher_agents/)
  assert.match(teacher,/learning_course_teacher_rooms/)
  assert.match(runtime,/allowedNamespaces: \['teacher', 'turn'\]/)
  assert.match(kernel,/allowedNamespaces/)
  assert.match(control,/Pulse may only call teacher\.\* and turn\.\*/)
  assert.match(control,/teacher\.\* is reserved for the product-managed Pulse Agent/)
})

test('learning remains an IPython namespace with transient per-turn context', () => {
  assert.match(kernel, /"learning"/)
  assert.match(runtime, /dynamicLearningItems/)
  assert.match(runtime, /items: \[\.\.\.session\.history, \.\.\.dynamicKnowledgeItems, \.\.\.dynamicLearningItems, \.\.\.dynamicTeacherItems\]/)
  assert.doesNotMatch(runtime, /systemInstructions: `\$\{candidate\.systemInstructions\}[^`]*JSON\.stringify\(context\.learningContext\)/s)
  assert.match(runtime, /const liveContext = hop === 0 \? context : await this\.host\.loadContext\(work\)/)
  assert.match(actions, /planning gate blocked/)
  assert.match(actions, /if \(method === 'ask'\)/)
  assert.match(actions, /kind: 'questionnaire'/)
  assert.match(actions, /'chat\.ask', 'polls\.create', 'polls\.show'/)
  assert.match(service, /finishMissionPlanning/)
  assert.match(service, /s\.type='check'/)
  assert.match(service, /s\.type='reflect'/)
})
