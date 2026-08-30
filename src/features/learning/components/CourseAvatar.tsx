import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getCourseAvatarUrl } from '../courseAvatar'

interface CourseAvatarProps {
  courseId: string
  title: string
  size?: 'sm' | 'default' | 'lg'
  className?: string
}

export function CourseAvatar({ courseId, title, size = 'default', className }: CourseAvatarProps) {
  return (
    <Avatar size={size} className={className}>
      <AvatarImage src={getCourseAvatarUrl(courseId)} alt="" />
      <AvatarFallback>{title.trim().slice(0, 1).toUpperCase() || '课'}</AvatarFallback>
    </Avatar>
  )
}

