import type { Client } from 'pg'
import { createLearningKnowledgeUnits, setLearningKnowledgeUnitStatus } from '../server/src/modules/learning/knowledge-units-application'
import { createProjectLearningActivity, publishProjectLearningActivity } from '../server/src/modules/learning/activities-application'

export async function seedLearningFixtures(db: Client) {
  const scope = { companyId: 'e2e-school', projectId: 'e2e-classroom' }
  const teacherId = '00000000-0000-4000-8000-000000000001'
  const objectiveTitle = 'E2E Explain triangle sides'
  if (!(await db.query('SELECT 1 FROM learning_knowledge_units WHERE project_id=$1 AND title=$2', [scope.projectId, objectiveTitle])).rowCount) {
    await createLearningKnowledgeUnits(db, work => work(db), {
      ...scope, actorId: teacherId, actorKind: 'teacher',
      knowledgeUnits: [{ title: objectiveTitle, successCriteria: 'Explain that a triangle has three sides.', targetLevel: 2 }],
    })
  }
  const { rows: [objective] } = await db.query<{ id: string }>(
    'SELECT id FROM learning_knowledge_units WHERE project_id=$1 AND title=$2', [scope.projectId, objectiveTitle],
  )
  await setLearningKnowledgeUnitStatus(db, { ...scope, teacherId, knowledgeUnitId: objective.id, status: 'PUBLISHED' })
  const title = 'E2E Triangle explanation'
  if (!(await db.query('SELECT 1 FROM learning_activities WHERE project_id=$1 AND title=$2', [scope.projectId, title])).rowCount) {
    const activity = await createProjectLearningActivity(db, work => work(db), {
      ...scope, actorId: teacherId, actorKind: 'teacher', title,
      instructions: 'Explain how many sides a triangle has and give one example.',
      kind: 'PRACTICE', evaluationMode: 'TEACHER_REQUIRED', targetLevel: 2, knowledgeUnitIds: [objective.id],
    })
    await publishProjectLearningActivity(work => work(db), { ...scope, teacherId, activityId: activity.id })
  }
}
