import { generatedCourseAvatarUrl } from '@/lib/generatedAvatar'

export function getCourseAvatarUrl(courseId: string): string {
  return generatedCourseAvatarUrl(courseId)
}
