import { Button } from '@/components/ui/button'
import { useApp } from '@/stores/app'
import type { LearningSpace } from '../contracts'

export function CourseContentSettings({ space }: { space: LearningSpace }) {
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">请在课程论坛中查看作业。需要布置作业时，点击“发布作业”，与教学助手拟定要求后确认发布。</p>
    <Button disabled={!space.courseId} onClick={() => useApp.getState().setView('forum')}>前往课程论坛</Button>
  </div>
}
