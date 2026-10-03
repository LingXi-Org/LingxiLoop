import { ws } from '@/api/core/realtime'
import type { WsEvent } from '@/api/contracts'
import { documentsApi } from '@/features/documents/api'
import { learningApi } from '@/features/learning/api'
import type { ApiCourse, LearningOverview, LearningSpace, TeacherLearningOverview } from '@/features/learning/contracts'
import { presentationsApi } from '@/features/presentations/api'
import type { PresentationResourceV1 } from '@/features/presentations/contracts'
import { activities, dashboard, evidence, learningSpace, missions, objectives, overview } from './ui-experience-fixtures'

export const teacherSpace: LearningSpace = { ...learningSpace, projectId: 'teacher-local', courseId: 'course-local', perspective: 'teacher', canReview: true, lifecycleAction: 'END' }
const course: ApiCourse = { id: 'course-local', companyId: teacherSpace.companyId, projectId: teacherSpace.projectId, projectKind: 'TEACHING', name: '本地课程：以证据支持设计判断', description: '课程资料、学习活动、成员管理与状态。', color: '#15803d', status: 'ACTIVE', createdBy: 'me', studyRoomId: null, courseRole: 'teacher', memberCount: 2, canManage: true }
const timestamp = '2026-10-03T00:00:00Z'
const document = { id: 'document-local', title: '本地协作文档', createdBy: 'me', conversationId: null, createdAt: timestamp, updatedAt: timestamp }
const teacherOverview: TeacherLearningOverview = { perspective: 'teacher', windowDays: 30, summary: {learnerCount: 2, pendingReviews: 0, attempts: 12, learnersWithEvidence: 1, dueReviews: 2}, masteryDistribution: overview.masteryDistribution, missionDistribution: [{status:'ACTIVE',count:2}], evaluationDistribution: [{status:'VERIFIED',count:3}], attention: [] }
const version = {schemaVersion:'presentation_version_v1' as const,id:'version-local',versionNumber:1,pageCount:1,sizeBytes:1024,sha256:'local',runtimeVersion:'local',rendererVersion:'local',createdAt:timestamp}
const presentation: PresentationResourceV1 = { presentation: {schemaVersion:'presentation_detail_v1',id:'presentation-local',title:'本地演示文稿',status:'ready',visibilityScope:'PROJECT',requestText:'本地验收',targetPageCount:1,recommendedPageCount:null,outlineRevision:0,outline:null,sourceSnapshot:[],latestVersion:version,error:null,createdAt:timestamp,updatedAt:timestamp},versions:[version] }

/** Public API seams only. No request leaves the local check page. */
export function installResourceFixtures(data: <T>(value: T, empty: T) => Promise<T>) {
  learningApi.getCourse = () => data(course, course)
  learningApi.getOverview = id => data<LearningOverview>(id === teacherSpace.projectId ? teacherOverview : overview, id === teacherSpace.projectId ? {...teacherOverview, summary:{learnerCount:0,pendingReviews:0,attempts:0,learnersWithEvidence:0,dueReviews:0},masteryDistribution:[],missionDistribution:[],evaluationDistribution:[],attention:[]} : {...overview,masteryDistribution:[],attemptTrend:[],assistanceDistribution:[],dueReviews:[],missionProgress:[]})
  learningApi.listKnowledgeUnits = () => data(objectives, [])
  learningApi.listActivities = () => data(activities, [])
  learningApi.listEvidence = () => data(evidence, [])
  learningApi.listMissions = () => data(missions, [])
  learningApi.getDashboard = () => data(dashboard, {...dashboard,states:[]})
  learningApi.listReviews = () => data([], [])
  learningApi.getGrowth = () => data({data:[{learnerId:'me',displayName:'林小溪',avatarUrl:null,points:12,evidenceCount:4,acceptedCount:3,independentCount:2,masteryPoints:8,waypoints:[{position:12,evidenceCount:4,objectiveCount:2}]}],nextCursor:null}, {data:[],nextCursor:null})
  learningApi.listLearners = () => data({data:[{learnerId:'local-learner',displayName:'本地学生',email:'learner@example.test',averageLevel:2,verifiedObjectives:3,dueReviews:1,needsReview:0,pausedMissions:0,attemptCount:8,lastAttemptAt:timestamp,attentionReasons:[]}],nextCursor:null}, {data:[],nextCursor:null})
  learningApi.listCourseMembers = () => data([{id:'me',name:'林小溪',email:'review@example.test',role:'teacher' as const,joinedAt:timestamp},{id:'local-learner',name:'本地学生长名字示例',email:'learner@example.test',role:'learner' as const,joinedAt:timestamp}], [])
  learningApi.listProjectInvitations = () => data([], [])
  learningApi.getNotificationPreferences = projectId => data({project_id:projectId ?? null,in_app_enabled:true,email_enabled:false,push_enabled:false,timezone:'Asia/Shanghai',daily_time:'09:00',weekly_day:1,quiet_start:null,quiet_end:null}, {project_id:projectId ?? null,in_app_enabled:false,email_enabled:false,push_enabled:false,timezone:'Asia/Shanghai',daily_time:'09:00',weekly_day:1,quiet_start:null,quiet_end:null})
  documentsApi.listDocuments = () => data({documents:[document]}, {documents:[]})
  documentsApi.getDocument = async () => document
  presentationsApi.getResource = () => data(presentation, {...presentation,versions:[]})
  presentationsApi.getVersionContent = async () => new Blob(['<!doctype html><html lang="zh-CN"><body style="background:#effaf2;color:#173b25;font:24px system-ui;padding:48px"><h1>本地演示文稿</h1><p>一页内容，用于验证预览区与操作栏。</p></body></html>'], {type:'text/html'})
  const listeners = new Set<(event: WsEvent) => void>()
  ws.on = listener => { listeners.add(listener); return () => listeners.delete(listener) }
  ws.isOpen = () => true
  ws.send = payload => {
    const event = payload as {type?: string; documentId?: string}
    if (event?.type === 'doc.subscribe' && typeof event.documentId === 'string') queueMicrotask(() => listeners.forEach(listener => listener({type:'doc.sync',documentId:event.documentId!,originId:'local-fixture',stateB64:'AAA='})))
    return true
  }
}
