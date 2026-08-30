import type { Queryable } from '../../db/queryable.js'
import type { LearningEffect } from './effects-repository.js'
import { listProjectChannels } from './repository.js'

export interface LearningEffectInfrastructure {
  syncStudyRoom(companyId: string, courseId: string): Promise<void>
  syncTeacherRoom(companyId: string, courseId: string): Promise<void>
  welcomeTeacherAgent(companyId: string, courseId: string): Promise<void>
  closeTeacherRoom(companyId: string, courseId: string): Promise<void>
  reactivateTeacherRoom(companyId: string, courseId: string): Promise<void>
  ensureNotebook(projectId: string, companyId: string): Promise<void>
  syncNotebook(projectId: string): Promise<void>
  syncChannel(channel: { channelId: string; title: string; members: string[] }): Promise<void>
  revokeDocumentSubscriptions(userId: string, companyId: string, projectId: string): Promise<void>
  publishDocumentAccessRevoked(event: {
    eventId: string
    companyId: string
    workspaceId: string
    userId: string
  }): Promise<void>
  seedMemberDms(companyId: string, userId: string): Promise<void>
}

export async function runLearningEffect(
  db: Queryable,
  infrastructure: LearningEffectInfrastructure,
  effect: LearningEffect,
): Promise<void> {
  const payload = effect.payload
  switch (effect.kind) {
    case 'study_room.sync':
      await infrastructure.syncStudyRoom(effect.companyId, effect.courseId)
      return
    case 'teacher_room.sync':
      await infrastructure.syncTeacherRoom(effect.companyId, effect.courseId)
      return
    case 'teacher_agent.welcome':
      await infrastructure.welcomeTeacherAgent(effect.companyId, effect.courseId)
      return
    case 'notebook.ensure': {
      const projectId = String(payload.projectId ?? '')
      if (!projectId) throw new Error('notebook effect requires projectId')
      await infrastructure.ensureNotebook(projectId, effect.companyId)
      return
    }
    case 'course_metadata.sync': {
      const projectId = String(payload.projectId ?? '')
      if (!projectId) throw new Error('course metadata sync requires projectId')
      if (payload.studyRoom === true) {
        await infrastructure.syncStudyRoom(effect.companyId, effect.courseId)
      }
      await infrastructure.syncNotebook(projectId)
      return
    }
    case 'course_archive.sync': {
      const projectId = String(payload.projectId ?? '')
      if (!projectId || typeof payload.archive !== 'boolean') {
        throw new Error('course archive sync requires projectId and archive state')
      }
      if (payload.archive) await infrastructure.closeTeacherRoom(effect.companyId, effect.courseId)
      else await infrastructure.reactivateTeacherRoom(effect.companyId, effect.courseId)
      await infrastructure.syncNotebook(projectId)
      return
    }
    case 'member_access.revoke': {
      const projectId = String(payload.projectId ?? '')
      const userId = String(payload.userId ?? '')
      if (!projectId || !userId) {
        throw new Error('member access revocation requires projectId and userId')
      }
      const channels = await listProjectChannels(db, { companyId: effect.companyId, projectId })
      await Promise.all(channels.map((channel) => infrastructure.syncChannel({
        channelId: channel.id,
        title: channel.title,
        members: channel.members,
      })))
      await infrastructure.revokeDocumentSubscriptions(userId, effect.companyId, projectId)
      await infrastructure.publishDocumentAccessRevoked({
        eventId: effect.id,
        companyId: effect.companyId,
        workspaceId: projectId,
        userId,
      })
      await infrastructure.syncStudyRoom(effect.companyId, effect.courseId)
      await infrastructure.syncTeacherRoom(effect.companyId, effect.courseId)
      return
    }
    case 'member_onboarding.seed': {
      const userId = String(payload.userId ?? '')
      if (!userId) throw new Error('member onboarding requires userId')
      await infrastructure.seedMemberDms(effect.companyId, userId)
      return
    }
  }
}
