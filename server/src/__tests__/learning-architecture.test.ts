import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const runtime = readFileSync(new URL('../agent-os/runtime.ts', import.meta.url), 'utf8')
const coreRuntime = readFileSync(new URL('../../../third_party/lingxios/src/runtime/runtime.ts', import.meta.url), 'utf8')
const promptContext = readFileSync(new URL('../agent-os/prompt-context.ts', import.meta.url), 'utf8')
const actions = readFileSync(new URL('../agent-os/learning-actions.ts', import.meta.url), 'utf8')
const legacyLearningUrl = new URL('../learning/', import.meta.url)
const legacyServiceUrl = new URL('../learning/service.ts', import.meta.url)
const service = existsSync(legacyServiceUrl) ? readFileSync(legacyServiceUrl, 'utf8') : ''
const learningModuleUrl = new URL('../modules/learning/', import.meta.url)
const repository = readdirSync(learningModuleUrl)
  .filter((name) => name.endsWith('-repository.ts'))
  .map((name) => readFileSync(new URL(name, learningModuleUrl), 'utf8'))
  .join('\n')
const missionRepositorySource = readFileSync(new URL('../modules/learning/missions-repository.ts', import.meta.url), 'utf8')
const evidenceRepositorySource = readFileSync(new URL('../modules/learning/evidence-repository.ts', import.meta.url), 'utf8')
const curriculumRepositorySource = readFileSync(new URL('../modules/learning/curriculum-repository.ts', import.meta.url), 'utf8')
const learningApplicationSource = readdirSync(learningModuleUrl)
  .filter((name) => name.endsWith('application.ts'))
  .map((name) => readFileSync(new URL(name, learningModuleUrl), 'utf8'))
  .join('\n')
const missionApplicationSource = [
  readFileSync(new URL('../modules/learning/missions-application.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('../modules/learning/mission-lifecycle-application.ts', import.meta.url), 'utf8'),
].join('\n')
const learningRuntimeSource = readFileSync(new URL('../modules/learning/runtime.ts', import.meta.url), 'utf8')
const learningRouterSource = readFileSync(new URL('../modules/learning/router.ts', import.meta.url), 'utf8')
const classroomRouterSource = readFileSync(new URL('../modules/learning/classroom-router.ts', import.meta.url), 'utf8')
const learningHttpAdapterSource = readFileSync(new URL('../modules/learning/http-adapter.ts', import.meta.url), 'utf8')
const evaluationApplicationSource = readFileSync(
  new URL('../modules/learning/evaluation-application.ts', import.meta.url),
  'utf8',
)
const learningStateSource = readFileSync(new URL('../modules/learning/learning-state.ts', import.meta.url), 'utf8')
const learningStateRepositorySource = readFileSync(
  new URL('../modules/learning/learning-state-repository.ts', import.meta.url),
  'utf8',
)
const teacherAgentSource = readFileSync(new URL('../modules/learning/teacher-agent-application.ts', import.meta.url), 'utf8')
const teacherApprovalRepositorySource = readFileSync(
  new URL('../modules/learning/teacher-approval-repository.ts', import.meta.url),
  'utf8',
)
const teacherReportingRepositorySource = readFileSync(
  new URL('../modules/learning/teacher-reporting-repository.ts', import.meta.url),
  'utf8',
)
const teacherRuntimeRepositorySource = readFileSync(
  new URL('../modules/learning/teacher-runtime-repository.ts', import.meta.url),
  'utf8',
)
const teacherProvisioningRepositorySource = readFileSync(
  new URL('../modules/learning/teacher-provisioning-repository.ts', import.meta.url),
  'utf8',
)
const teacherDigestRepositorySource = readFileSync(
  new URL('../modules/learning/teacher-digest-repository.ts', import.meta.url),
  'utf8',
)
const teacherManagementRepositorySource = readFileSync(
  new URL('../modules/learning/teacher-management-repository.ts', import.meta.url),
  'utf8',
)
const kernel = readFileSync(new URL('../../../third_party/lingxios/kernel/runner.py', import.meta.url), 'utf8')

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
      return /(?:from\s+|import\(\s*)['"][^'"]*\/learning\/(?!contracts\.js|runtime\.js|public\.js|worker\.js|preset\.js|router\.js)[^'"]+['"]/.test(source)
        ? [relative(serverRoot, path)]
        : []
    })
  assert.deepEqual(violations, [])
})

test('the legacy Learning service implementation is deleted', () => {
  assert.equal(existsSync(legacyLearningUrl), false)
  assert.equal(existsSync(legacyServiceUrl), false)
  assert.doesNotMatch(learningApplicationSource, /learning\/service\.js/)
  const teacher = readFileSync(new URL('../modules/learning/teacher-agent-application.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(teacher, /from '.\/service\.js'/)
  assert.match(repository, /member\.company_id=\$1 AND course\.id=\$2 AND member\.status='ACTIVE'[\s\S]*member\.role IN \('OWNER','TEACHER'\)/)
  assert.match(repository, /teacher_room\.company_id=\$1 AND teacher_room\.conversation_id=conversation\.id/)
})

test('Learning routers share one private request and error adapter', () => {
  for (const router of [learningRouterSource, classroomRouterSource]) {
    assert.match(router, /from '.\/http-adapter\.js'/)
    assert.doesNotMatch(router, /function (?:parse|mapLearningError|respond)\b/)
  }
  assert.match(learningHttpAdapterSource, /export function parseLearningRequest/)
  assert.match(learningHttpAdapterSource, /function mapLearningError/)
  assert.match(learningHttpAdapterSource, /export async function respondWithLearning/)
})

test('native learning provisioning writes effects through the durable queue', () => {
  assert.match(learningApplicationSource, /enqueueLearningEffect/)
  assert.doesNotMatch(learningApplicationSource, /const provisioning = await Promise\.allSettled/)
})

test('knowledge-unit persistence has one tenant and project scoped repository path', () => {
  assert.doesNotMatch(service, /INSERT INTO learning_objectives/)
  assert.doesNotMatch(service, /UPDATE learning_objectives SET status/)
  assert.doesNotMatch(curriculumRepositorySource, /\blearning_objectives\b/)
  assert.match(repository, /unit\.company_id=\$1 AND unit\.project_id=\$2/)
  assert.match(repository, /learning_knowledge_unit_dependencies/)
})

test('production runtime has no legacy learning fact table or Attempt Course dependency', () => {
  const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const violations = productionTypeScriptFiles(serverRoot)
    .filter((path) => relative(serverRoot, path).replaceAll('\\', '/') !== 'db/migrate.ts')
    .flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      return /\blearning_(?:objectives|mastery|mastery_events)\b|\battempt\.course_id\b/.test(source)
        ? [relative(serverRoot, path)]
        : []
    })
  assert.deepEqual(violations, [])
})

test('activity writes and UI submissions have one tenant-scoped repository path', () => {
  assert.doesNotMatch(service, /INSERT INTO learning_activities/)
  assert.doesNotMatch(service, /UPDATE learning_activities/)
  assert.doesNotMatch(service, /kind: 'ui_submission'/)
  assert.match(repository, /activity\.company_id=\$1 AND activity\.project_id=\$2/)
  assert.match(repository, /learning_activity_knowledge_units/)
})

test('mission reads and coordinator assignment have one tenant-scoped repository path', () => {
  assert.doesNotMatch(service, /SELECT \* FROM learning_missions WHERE id=/)
  assert.doesNotMatch(service, /SET coordinator_agent_id=\$3/)
  assert.match(missionRepositorySource, /mission\.company_id=\$1 AND mission\.project_id=\$2/)
  assert.match(missionApplicationSource, /assignLearningMissionCoordinator[\s\S]*action: 'learning:manage'/)
  assert.doesNotMatch(missionRepositorySource, /project_memberships|\brole IN \(/)
})

test('mission planning and completion writes live only in application and repository', () => {
  assert.doesNotMatch(service, /INSERT INTO learning_mission_steps/)
  assert.doesNotMatch(service, /UPDATE learning_mission_steps/)
  assert.doesNotMatch(service, /SET status='completed',completed_at=/)
  assert.match(missionApplicationSource, /lockLearningMission/)
  assert.match(missionRepositorySource, /company_id=\$1 AND project_id=\$2 AND conversation_id=\$3/)
})

test('mission start uses the public vertical slice instead of the legacy service', () => {
  assert.doesNotMatch(service, /INSERT INTO learning_missions/)
  assert.doesNotMatch(service, /mission-coordinator-/)
  assert.doesNotMatch(learningRuntimeSource, /startMission,[\s\S]*from '..\/..\/learning\/service\.js'/)
  assert.match(missionApplicationSource, /startLearningMission/)
  assert.match(missionApplicationSource, /infrastructure\.syncMessages/)
  assert.match(missionRepositorySource, /ON CONFLICT\(company_id,project_id,learner_id,conversation_id,trigger_client_msg_no\)/)
})

test('Agent OS attempt recording uses the tenant-scoped Learning vertical slice', () => {
  assert.doesNotMatch(service, /INSERT INTO learning_attempts/)
  assert.doesNotMatch(learningRuntimeSource, /recordAttempt,[\s\S]*from '..\/..\/learning\/service\.js'/)
  assert.match(missionApplicationSource, /recordLearningAttempt/)
  assert.match(evidenceRepositorySource, /mission\.conversation_id=\$4 AND mission\.learner_id=\$5/)
  assert.match(evidenceRepositorySource, /document\.company_id=\$2 AND document\.project_id=\$3/)
  assert.match(evidenceRepositorySource, /canvas\.company_id=\$2 AND canvas\.project_id=\$3/)
})

test('Agent OS turn context uses repository reads without legacy fallback handling', () => {
  assert.doesNotMatch(service, /loadLearningTurnContext/)
  assert.doesNotMatch(learningRuntimeSource, /loadLearningTurnContext,[\s\S]*from '..\/..\/learning\/service\.js'/)
  assert.match(missionApplicationSource, /loadLearningContext/)
  assert.doesNotMatch(missionApplicationSource, /try \{ room = await findLearningRoomState[\s\S]*catch/)
  assert.match(evidenceRepositorySource, /state\.company_id=\$1 AND state\.project_id=\$2 AND state\.user_id=\$3/)
  assert.match(evidenceRepositorySource, /evaluation\.company_id=\$1 AND evaluation\.project_id=\$2/)
  assert.match(missionApplicationSource, /units\.slice\(0, 10\)/)
  assert.match(missionApplicationSource, /mission\.steps\.slice\(0, 10\)/)
})

test('Agent OS evaluation proposals use the tenant-scoped Learning vertical slice', () => {
  assert.doesNotMatch(service, /INSERT INTO learning_evaluations/)
  assert.doesNotMatch(learningRuntimeSource, /proposeEvaluation,[\s\S]*from '..\/..\/learning\/service\.js'/)
  assert.match(learningApplicationSource, /proposeLearningEvaluation/)
  assert.match(repository, /attempt\.id=\$1 AND attempt\.company_id=\$2 AND attempt\.project_id=\$3/)
  assert.match(repository, /source_evidence\.id=\$1 AND source_evidence\.company_id=\$3 AND source_evidence\.project_id=\$4/)
  assert.match(repository, /canvas\.project_id=\$4/)
  assert.match(learningStateRepositorySource, /evaluation\.company_id=\$1 AND evaluation\.project_id=\$2/)
  assert.match(learningStateRepositorySource, /evaluation\.id<>\$5/)
  assert.match(learningStateRepositorySource, /learning_activity_knowledge_units activity_unit/)
})

test('teacher evaluation review shares the same repository and LearningState projection boundary', () => {
  const teacher = readFileSync(new URL('../modules/learning/teacher-agent-application.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(service, /\breviewEvaluation\b|INSERT INTO learning_mastery|UPDATE learning_evaluations/)
  assert.doesNotMatch(teacher, /\breviewEvaluation\b/)
  assert.match(teacher, /reviewLearningEvaluation/)
  assert.match(learningApplicationSource, /reviewLearningEvaluation/)
  assert.match(evaluationApplicationSource, /reviewProjectLearningEvaluation/)
  assert.match(evaluationApplicationSource, /resource: \{ type: 'project', id: input\.projectId \}/)
  assert.match(evaluationApplicationSource, /requireLearningCourseProjectScope[\s\S]*reviewProjectLearningEvaluation/)
  assert.match(learningStateRepositorySource, /evaluation\.company_id=\$2 AND evaluation\.project_id=\$3/)
  assert.match(learningStateRepositorySource, /evaluation\.status='PENDING'/)
  assert.match(learningStateRepositorySource, /SET status='EVALUATED'/)
  assert.match(learningStateRepositorySource, /version=learning_states\.version\+1/)
  assert.doesNotMatch(learningStateRepositorySource, /learning_mastery|learning_mastery_events/)
  assert.match(learningStateSource, /projectLearningState/)
  assert.doesNotMatch(learningStateSource, /projectMastery|mastery policy/)
})

test('Learning project evidence reads no longer use the legacy service data plane', () => {
  for (const legacyRead of ['learningDashboard','courseProgress','listEvidence','listEvaluationQueue']) {
    assert.doesNotMatch(service, new RegExp(`\\b${legacyRead}\\b`))
    assert.doesNotMatch(learningApplicationSource, new RegExp(`from '../../learning/service\\.js'[\\s\\S]*\\b${legacyRead}\\b`))
  }
  assert.match(missionApplicationSource, /learningStateContext/)
  assert.match(missionApplicationSource, /countPendingLearningEvaluations/)
  assert.match(evidenceRepositorySource, /state\.company_id=\$1 AND state\.project_id=\$2 AND state\.user_id=\$3/)
  assert.match(evidenceRepositorySource, /evaluation\.company_id=\$1 AND evaluation\.project_id=\$2/)
})

test('Pulse reporting reads use one explicit tenant-scoped repository', () => {
  assert.match(teacherAgentSource, /from '.\/teacher-reporting-repository\.js'/)
  assert.doesNotMatch(teacherAgentSource, /if\(method==='list_objectives'\)return \(await db\.query/)
  assert.doesNotMatch(teacherAgentSource, /if\(method==='list_activities'\)return \(await db\.query/)
  assert.doesNotMatch(teacherAgentSource, /if\(method==='list_reviews'\)return \(await db\.query/)
  assert.doesNotMatch(teacherAgentSource, /if\(method==='list_rooms'\)return \(await db\.query/)
  assert.match(teacherReportingRepositorySource, /attempt\.company_id=\$1 AND attempt\.project_id=\$2/)
  assert.match(teacherReportingRepositorySource, /state\.company_id=\$1 AND state\.project_id=\$2/)
  assert.match(teacherReportingRepositorySource, /member\.company_id=\$1 AND member\.project_id=\$2 AND member\.status='ACTIVE'/)
  assert.match(teacherReportingRepositorySource, /course\.company_id=\$1 AND course\.id=\$2/)
  assert.doesNotMatch(teacherReportingRepositorySource, /learning_mastery|learning_objectives|attempt\.course_id/)
})

test('Pulse approval snapshots and freshness use one tenant-scoped repository', () => {
  assert.match(teacherAgentSource, /from '.\/teacher-approval-repository\.js'/)
  assert.doesNotMatch(teacherAgentSource, /SELECT objective\.updated_at AS value/)
  assert.doesNotMatch(teacherAgentSource, /SELECT activity\.updated_at AS value/)
  assert.match(teacherApprovalRepositorySource, /objective\.company_id=\$1 AND objective\.id=\$3/)
  assert.match(teacherApprovalRepositorySource, /activity\.company_id=\$1 AND activity\.id=\$3/)
  assert.match(teacherApprovalRepositorySource, /course\.company_id=\$1 AND course\.id=\$3/)
  assert.match(teacherApprovalRepositorySource, /member\.company_id=\$1 AND teacher_room\.conversation_id=\$2/)
  assert.match(teacherApprovalRepositorySource, /course\.company_id=attempt\.company_id AND course\.project_id=attempt\.project_id/)
  assert.match(teacherApprovalRepositorySource, /attempt\.company_id=evaluation\.company_id AND attempt\.project_id=evaluation\.project_id/)
})

test('Pulse runtime scope and turn counts use one tenant-scoped repository', () => {
  assert.match(teacherAgentSource, /from '.\/teacher-runtime-repository\.js'/)
  assert.doesNotMatch(teacherAgentSource, /SELECT message\.author_id/)
  assert.doesNotMatch(teacherAgentSource, /AS pending_reviews/)
  assert.match(teacherAgentSource, /wukongClient\(\)\.syncMessages\(work\.channelId, 2, 80, work\.agentId\)/)
  assert.match(teacherRuntimeRepositorySource, /project_agent\.company_id=\$1 AND project_agent\.agent_id=\$2/)
  assert.match(teacherRuntimeRepositorySource, /approval\.company_id=\$1 AND approval\.agent_id=\$3[\s\S]*approval\.channel_id=\$4/)
  assert.doesNotMatch(teacherRuntimeRepositorySource, /FROM messages/)
  assert.match(teacherRuntimeRepositorySource, /member\.company_id=\$1 AND member\.project_id=\$2 AND member\.status='ACTIVE'/)
  assert.match(teacherRuntimeRepositorySource, /objective\.company_id=\$1 AND objective\.project_id=\$2/)
  assert.match(teacherRuntimeRepositorySource, /activity\.company_id=\$1 AND activity\.project_id=\$2/)
  assert.match(teacherRuntimeRepositorySource, /attempt\.company_id=\$1 AND attempt\.project_id=\$2/)
  assert.doesNotMatch(teacherRuntimeRepositorySource, /learning_objectives|attempt\.course_id/)
})

test('Pulse application orchestration contains no SQL and lifecycle scope is explicit', () => {
  assert.doesNotMatch(teacherAgentSource, /\b(?:SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/)
  assert.doesNotMatch(teacherAgentSource, /\b(?:db|pool)\.query\b/)
  assert.match(teacherProvisioningRepositorySource, /course\.company_id=\$1 AND course\.id=\$2/)
  assert.match(teacherProvisioningRepositorySource, /teacher_room\.company_id=\$1 AND teacher_room\.course_id=\$2/)
  assert.match(teacherProvisioningRepositorySource, /member\.company_id=\$1 AND course\.id=\$2 AND member\.status='ACTIVE'[\s\S]*member\.role IN \('OWNER','TEACHER'\)/)
  assert.match(teacherProvisioningRepositorySource, /approval\.company_id=course\.company_id/)
  assert.match(teacherDigestRepositorySource, /WHERE company_id=\$1 AND id=\$2/)
  assert.match(teacherManagementRepositorySource, /course\.company_id=\$1 AND course\.id=\$2/)
  assert.match(learningApplicationSource, /ensureTeacherAgent\(scope\.companyId, courseId, db\)/)
  assert.match(learningApplicationSource, /syncTeacherRoom\(effect\.companyId, effect\.courseId\)/)
})

test('Pulse is Project-scoped, teacher-room-scoped and IPython namespace restricted',()=>{
  const teacher=readFileSync(new URL('../modules/learning/teacher-agent-application.ts',import.meta.url),'utf8')
  const hostAction=readFileSync(new URL('../agent-os/host-action-application.ts',import.meta.url),'utf8')
  const hostActionRepository=readFileSync(new URL('../agent-os/host-action-repository.ts',import.meta.url),'utf8')
  assert.match(teacher,/PULSE_CAPABILITIES = \['teacher_admin'\]/)
  assert.match(teacherProvisioningRepositorySource,/JSON\.stringify\(\['ipython'\]\)/)
  assert.match(teacherProvisioningRepositorySource,/learning_project_teacher_agents/)
  assert.match(teacherProvisioningRepositorySource,/learning_course_teacher_rooms/)
  assert.match(runtime,/return \[\{ name: 'teacher' \}\]/)
  assert.match(kernel,/context\.get\("capabilities"\)/)
  assert.match(hostAction,/Pulse may only call teacher\.\*/)
  assert.match(hostAction,/teacher\.\* is reserved for the product-managed Pulse Agent/)
  assert.doesNotMatch(hostAction,/\b(?:SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/)
  assert.match(hostActionRepository,/SELECT p\.capabilities/)
})

test('learning remains an IPython namespace with transient per-turn context', () => {
  assert.match(kernel, /class _SdkModule/)
  assert.match(kernel, /method\.startswith\("_"\)/)
  assert.match(runtime, /dynamicContextItems/)
  assert.match(promptContext, /Relevant memory for THIS TURN ONLY/)
  assert.match(promptContext, /Authorized learning state for THIS TURN ONLY/)
  assert.doesNotMatch(runtime, /systemInstructions: `\$\{candidate\.systemInstructions\}[^`]*JSON\.stringify\(context\.learningContext\)/s)
  assert.match(coreRuntime, /const liveContext = hop === 0 \? context : await this\.host\.loadContext\(work\)/)
  assert.match(actions, /planning gate blocked/)
  assert.match(actions, /if \(method === 'ask'\)/)
  assert.match(actions, /kind: 'questionnaire'/)
  assert.match(actions, /'chat\.ask', 'polls\.create', 'polls\.show'/)
  assert.match(actions, /method === 'list_knowledge_units'/)
  assert.match(actions, /method === 'draft_knowledge_units'/)
  assert.match(actions, /closedArg/)
  assert.doesNotMatch(actions, /list_objectives|draft_objectives|\.toUpperCase\(/)
  assert.match(runtime, /list_knowledge_units\(\)/)
  assert.match(runtime, /draft_knowledge_units\(knowledgeUnits=/)
  assert.match(runtime, /All enum values are exact uppercase closed values; lowercase values are invalid/)
  assert.match(runtime, /Personal project conversations participate directly without a Course/)
  assert.doesNotMatch(runtime.match(/export function learningContextContract[\s\S]*?\n\}/)?.[0] ?? '', /list_objectives|draft_objectives/)
  assert.match(missionApplicationSource, /finishLearningMissionPlanning/)
  assert.match(missionApplicationSource, /summary\.checks < 1/)
  assert.match(missionApplicationSource, /summary\.reflections < 1/)
})

test('Pulse uses the generic, capability-gated host.teacher bridge', () => {
  assert.match(kernel, /SDK_MODULE_NAME = "host"/)
  assert.match(kernel, /if namespace\.startswith\("_"\) or namespace not in bridge\.capabilities/)
  assert.doesNotMatch(kernel, /TeacherSDK|company_id|project_id|course_id|room_id/)
  assert.match(actions, /if \(namespace === 'teacher'\) return \{ ok: true, value: await executeTeacherAction/)
})
