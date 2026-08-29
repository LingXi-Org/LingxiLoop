import { Card, CardContent } from '@/components/ui/card'
import type { LearningEvidence } from '../contracts'
import { ASSISTANCE_LABELS, MasteryBadge } from './learningDisplay'

export function LearningEvidenceSection({ evidence }: { evidence: LearningEvidence[] }) {
  return (
    <div className="space-y-3">
      {evidence.map((item, index) => (
        <Card key={item.id} size="sm">
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-heading text-sm font-medium">尝试 #{evidence.length - index}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleString()} · {ASSISTANCE_LABELS[item.assistance] ?? item.assistance}
                </p>
              </div>
              {item.demonstrated_level !== null
                ? <MasteryBadge level={item.demonstrated_level} />
                : <span className="text-xs text-muted-foreground">等待评价</span>}
            </div>
            {item.feedback && <p className="mt-3 text-sm text-muted-foreground">{item.feedback}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
