import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../db/migrate.ts', import.meta.url), 'utf8')
const runtime = readFileSync(new URL('../agent-os/runtime.ts', import.meta.url), 'utf8')
const actions = readFileSync(new URL('../agent-os/learning-actions.ts', import.meta.url), 'utf8')
const service = readFileSync(new URL('../learning/service.ts', import.meta.url), 'utf8')
const kernel = readFileSync(new URL('../../agent-os/kernel_runner.py', import.meta.url), 'utf8')

test('native learning schema keeps evidence, projection and delivery ledgers durable', () => {
  for (const table of ['learning_courses','learning_course_memberships','learning_course_rooms','learning_objectives','learning_activities',
    'learning_missions','learning_mission_steps','learning_attempts','learning_evaluations','learning_mastery','learning_mastery_events','learning_notification_deliveries',
    'learning_project_teacher_agents','learning_course_teacher_rooms']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`))
  }
  assert.match(migration, /num_nonnulls\(activity_id, mission_step_id\) = 1/)
  assert.match(migration, /UNIQUE\(course_id, learner_id, conversation_id, trigger_client_msg_no\)/)
  assert.match(migration, /uq_learning_deliveries_course/)
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
  assert.match(service, /finishMissionPlanning/)
  assert.match(service, /s\.type='check'/)
  assert.match(service, /s\.type='reflect'/)
})
