import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { safe } from '../../http/async-handler.js'
import { requireCompany } from '../../http/request-context.js'
import { requireLearningCourseRole } from './membership-application.js'
import { findActiveTeacherRoom } from './teacher-provisioning-repository.js'
import { prepareTeacherRoom } from './teacher-agent-application.js'
import { LearningApplicationError } from './errors.js'
import { HomeworkApplication } from './homework-application.js'
import { homeworkDeadlineSchema, homeworkEditSchema, homeworkPublishSchema, homeworkReportSchema, homeworkReviewSchema,
  homeworkRevisionSchema, homeworkSaveAnswerSchema, homeworkShareSchema, homeworkSubmitSchema, homeworkUnlockSchema } from './homework-contracts.js'
import { forumPageSchema, forumStudentsSchema } from './forum-contracts.js'
import { parseLearningRequest as parse, respondWithLearning as respond } from './http-adapter.js'

export const homeworkRouter=Router()
const homework=new HomeworkApplication(pool,work=>withTransaction(pool,work))
homeworkRouter.post('/courses/:courseId/teacher-agent',safe(async(req,res)=>{
  const scope=await requireCompany(req),courseId=String(req.params.courseId)
  res.json(await respond(()=>prepareTeacherRoom(scope,courseId,work=>withTransaction(pool,work))))
}))
homeworkRouter.get('/courses/:courseId/teacher-agent',safe(async(req,res)=>{
  const scope=await requireCompany(req),courseId=String(req.params.courseId)
  res.json(await respond(async()=>{
    await requireLearningCourseRole(pool,{...scope,courseId,role:'teacher'})
    const room=await findActiveTeacherRoom(pool,scope.companyId,courseId)
    if (!room) throw new LearningApplicationError('not_found','teacher room not found')
    return {roomId:room.conversationId,agentId:room.agentId,roomStatus:'active'}
  }))
}))
const path='/courses/:courseId/homeworks/:homeworkId'
homeworkRouter.get(path,safe(async(req,res)=>{
  const scope=await requireCompany(req)
  res.json(await respond(()=>homework.detail(scope,String(req.params.courseId),String(req.params.homeworkId))))
}))
homeworkRouter.patch(`${path}/draft`,safe(async(req,res)=>{
  const scope=await requireCompany(req),input=parse(homeworkEditSchema.safeParse(req.body))
  res.json(await respond(()=>homework.updateDraft(scope,String(req.params.courseId),String(req.params.homeworkId),input)))
}))
homeworkRouter.post(`${path}/publish`,safe(async(req,res)=>{
  const scope=await requireCompany(req),input=parse(homeworkPublishSchema.safeParse(req.body))
  res.json(await respond(()=>homework.publish(scope,String(req.params.courseId),String(req.params.homeworkId),input)))
}))
homeworkRouter.post(`${path}/close`,safe(async(req,res)=>{
  const scope=await requireCompany(req),input=parse(homeworkRevisionSchema.safeParse(req.body))
  res.json(await respond(()=>homework.close(scope,String(req.params.courseId),String(req.params.homeworkId),input)))
}))
homeworkRouter.patch(`${path}/deadline`,safe(async(req,res)=>{
  const scope=await requireCompany(req),input=parse(homeworkDeadlineSchema.safeParse(req.body))
  res.json(await respond(()=>homework.extendDeadline(scope,String(req.params.courseId),String(req.params.homeworkId),input)))
}))
homeworkRouter.post(`${path}/thread`,safe(async(req,res)=>{
  const scope=await requireCompany(req)
  res.json(await respond(()=>homework.start(scope,String(req.params.courseId),String(req.params.homeworkId))))
}))
homeworkRouter.patch(`${path}/answer`,safe(async(req,res)=>{
  const scope=await requireCompany(req),input=parse(homeworkSaveAnswerSchema.safeParse(req.body))
  res.json(await respond(()=>homework.saveAnswer(scope,String(req.params.courseId),String(req.params.homeworkId),input)))
}))
homeworkRouter.post(`${path}/report`,safe(async(req,res)=>{
  const scope=await requireCompany(req),input=parse(homeworkReportSchema.safeParse(req.body))
  res.json(await respond(()=>homework.requestReport(scope,String(req.params.courseId),String(req.params.homeworkId),input)))
}))
homeworkRouter.post(`${path}/submit`,safe(async(req,res)=>{
  const scope=await requireCompany(req),input=parse(homeworkSubmitSchema.safeParse(req.body))
  res.json(await respond(()=>homework.submit(scope,String(req.params.courseId),String(req.params.homeworkId),input)))
}))
homeworkRouter.post(`${path}/share-evidence`,safe(async(req,res)=>{
  const scope=await requireCompany(req),input=parse(homeworkShareSchema.safeParse(req.body))
  res.json(await respond(()=>homework.shareEvidence(scope,String(req.params.courseId),String(req.params.homeworkId),input)))
}))
homeworkRouter.post(`${path}/manual-unlock`,safe(async(req,res)=>{
  const scope=await requireCompany(req),input=parse(homeworkUnlockSchema.safeParse(req.body))
  res.json(await respond(()=>homework.manualUnlock(scope,String(req.params.courseId),String(req.params.homeworkId),input)))
}))
homeworkRouter.post(`${path}/review`,safe(async(req,res)=>{
  const scope=await requireCompany(req),input=parse(homeworkReviewSchema.safeParse(req.body))
  res.json(await respond(()=>homework.review(scope,String(req.params.courseId),String(req.params.homeworkId),input)))
}))
homeworkRouter.get(`${path}/learners`,safe(async(req,res)=>{
  const scope=await requireCompany(req),query=parse(forumStudentsSchema.safeParse(req.query))
  res.json(await respond(()=>homework.learners(scope,String(req.params.courseId),String(req.params.homeworkId),query.offset,query.search)))
}))
homeworkRouter.get(`${path}/submissions`,safe(async(req,res)=>{
  const scope=await requireCompany(req),query=parse(forumPageSchema.extend({learnerId:z.string().max(200).default('')}).safeParse(req.query))
  res.json(await respond(()=>homework.submissions(scope,String(req.params.courseId),String(req.params.homeworkId),query.offset,query.learnerId)))
}))
