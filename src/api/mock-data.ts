import { normalizeCourseContract } from './courseContract'
import type { ApiCompanyMember, ApiCompanyProfile, ApiCourse, ApiCourseInvitation, ApiCourseMember, ApiProject } from './contracts'

export const MOCK_COMPANY_ID = 'mock-workspace'
export const MOCK_NOW = '2026-08-26T00:00:00.000Z'

const courses: ApiCourse[] = [
  normalizeCourseContract({ id: 'mock-course-ai', companyId: MOCK_COMPANY_ID, projectId: 'mock-research', name: 'AI 产品研究', description: 'Teacher 示例课程', courseRole: 'teacher', companyRole: 'owner', studyRoomId: 'mock-general', memberCount: 3, canManage: true }),
  normalizeCourseContract({ id: 'mock-course-design', companyId: MOCK_COMPANY_ID, projectId: 'mock-launch', name: '交互设计基础', description: 'Learner 示例课程', courseRole: 'learner', companyRole: 'owner', studyRoomId: 'mock-launch-room', memberCount: 2, canManage: true, color: '#d97706' }),
]
const projects: ApiProject[] = courses.map((course) => ({
  id: course.projectId, name: course.name, description: course.description, color: course.color,
  status: course.status, createdBy: 'mock-me', isGeneral: false, createdAt: MOCK_NOW,
  updatedAt: MOCK_NOW, archivedAt: null, lastVisitedAt: MOCK_NOW, sourceCount: 2,
  conversationCount: 2, documentCount: 1, boardCount: 1, calendarEventCount: 1,
  canvasCount: 1, canManage: course.canManage,
}))
const company: ApiCompanyProfile = {
  id: MOCK_COMPANY_ID, name: 'LingxiLoop 本地工作区', slug: 'local',
  description: '用于验证 Company 与多课程管理的开发数据。', role: 'owner', createdAt: MOCK_NOW,
}
const companyMembers: ApiCompanyMember[] = [
  { id: 'mock-me', name: '林曦', email: 'dev@localhost', role: 'owner', joinedAt: MOCK_NOW, courses: [
    { courseId: 'mock-course-ai', name: 'AI 产品研究', role: 'teacher' },
    { courseId: 'mock-course-design', name: '交互设计基础', role: 'learner' },
  ] },
  { id: 'mock-teacher', name: '陈老师', email: 'teacher@example.com', role: 'member', joinedAt: MOCK_NOW, courses: [
    { courseId: 'mock-course-ai', name: 'AI 产品研究', role: 'teacher' },
  ] },
  { id: 'mock-learner', name: '李同学', email: 'learner@example.com', role: 'member', joinedAt: MOCK_NOW, courses: [
    { courseId: 'mock-course-ai', name: 'AI 产品研究', role: 'learner' },
    { courseId: 'mock-course-design', name: '交互设计基础', role: 'learner' },
  ] },
]
const courseMembers: Record<string, ApiCourseMember[]> = {
  'mock-course-ai': [
    { id: 'mock-me', name: '林曦', email: 'dev@localhost', role: 'teacher', joinedAt: MOCK_NOW },
    { id: 'mock-teacher', name: '陈老师', email: 'teacher@example.com', role: 'teacher', joinedAt: MOCK_NOW },
    { id: 'mock-learner', name: '李同学', email: 'learner@example.com', role: 'learner', joinedAt: MOCK_NOW },
  ],
  'mock-course-design': [
    { id: 'mock-me', name: '林曦', email: 'dev@localhost', role: 'learner', joinedAt: MOCK_NOW },
    { id: 'mock-teacher', name: '陈老师', email: 'teacher@example.com', role: 'teacher', joinedAt: MOCK_NOW },
  ],
}
const courseInvitations: Record<string, ApiCourseInvitation[]> = {
  'mock-course-ai': [{ id: 'mock-invite', email: null, role: 'learner', note: '班级公开链接', maxUses: 30, useCount: 4, createdAt: MOCK_NOW, expiresAt: '2026-09-02T00:00:00.000Z', status: 'active' }],
  'mock-course-design': [],
}

export const mockApiData = { company, courses, projects, companyMembers, courseMembers, courseInvitations }
