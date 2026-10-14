import type { Client } from 'pg'
export async function seedLearningFixtures(db: Client) {
  await db.query(`INSERT INTO course_forum_posts(id,company_id,project_id,author_user_id,kind,title,body)
    VALUES('e2e-assignment','e2e-school','e2e-classroom','00000000-0000-4000-8000-000000000001','assignment','E2E Triangle explanation','Explain how many sides a triangle has.') ON CONFLICT DO NOTHING`)
}
