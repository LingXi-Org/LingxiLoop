import type { Queryable } from '../../db/queryable.js'
import type { LearningActivityImportInput } from './contracts.js'

type ImportedActivity = LearningActivityImportInput['activities'][number]

export async function insertImportedLearningActivity(db: Queryable, input: {
  id: string
  companyId: string
  projectId: string
  actorId: string
  activity: ImportedActivity
}): Promise<{ created: boolean; matches: boolean }> {
  const activity = input.activity
  const knowledgeUnitIds = [...new Set(activity.knowledgeUnitIds)]
  const { rows } = await db.query<{ created: boolean; matches: boolean }>(
    `WITH valid_project AS (
       SELECT project.company_id,project.id AS project_id
         FROM projects project
        WHERE project.company_id=$2 AND project.id=$3
          AND (SELECT COUNT(*)::int FROM learning_knowledge_units unit
                WHERE unit.company_id=project.company_id AND unit.project_id=project.id
                  AND unit.id=ANY($11::text[]))=cardinality($11::text[])
     ), inserted_activity AS (
       INSERT INTO learning_activities
         (id,company_id,project_id,title,instructions,kind,evaluation_mode,target_level,rubric,due_at,created_by)
       SELECT $1,company_id,project_id,$4,$5,$6,$7,$8,$9::jsonb,$10,$12 FROM valid_project
       ON CONFLICT (id) DO NOTHING
       RETURNING id,company_id,project_id
     ), inserted_links AS (
       INSERT INTO learning_activity_knowledge_units(company_id,project_id,activity_id,knowledge_unit_id)
       SELECT imported.company_id,imported.project_id,imported.id,unit.id
         FROM inserted_activity imported
         JOIN learning_knowledge_units unit
           ON unit.company_id=imported.company_id AND unit.project_id=imported.project_id
          AND unit.id=ANY($11::text[])
       RETURNING knowledge_unit_id
     ), existing AS (
       SELECT activity.id,
              activity.title=$4 AND activity.instructions=$5 AND activity.kind=$6
              AND activity.evaluation_mode=$7 AND activity.target_level=$8
              AND activity.rubric=$9::jsonb
              AND activity.due_at IS NOT DISTINCT FROM $10::timestamptz
              AND activity.status='DRAFT'
              AND NOT EXISTS (
                SELECT 1 FROM learning_activity_knowledge_units link
                 WHERE link.company_id=activity.company_id AND link.project_id=activity.project_id
                   AND link.activity_id=activity.id AND NOT (link.knowledge_unit_id=ANY($11::text[])))
              AND (SELECT COUNT(*)::int FROM learning_activity_knowledge_units link
                    WHERE link.company_id=activity.company_id AND link.project_id=activity.project_id
                      AND link.activity_id=activity.id)=cardinality($11::text[]) AS matches
         FROM learning_activities activity
        WHERE activity.id=$1 AND activity.company_id=$2 AND activity.project_id=$3
     ) SELECT EXISTS(SELECT 1 FROM inserted_activity) AS created,
              EXISTS(SELECT 1 FROM inserted_activity)
                OR COALESCE((SELECT matches FROM existing),FALSE) AS matches`,
    [input.id, input.companyId, input.projectId, activity.title, activity.instructions,
      activity.kind, activity.evaluationMode, activity.targetLevel, JSON.stringify(activity.rubric),
      activity.dueAt ?? null, knowledgeUnitIds, input.actorId],
  )
  return rows[0] ?? { created: false, matches: false }
}
