import { Button } from '@/components/ui/button'
import { LEARNING_HELP, type LearningHelpIntent } from './learning-help'

export function LearningHelpActions({ disabled, onSelect }: { disabled?: boolean; onSelect(intent: LearningHelpIntent): void }) {
  return <div role="group" aria-label="学习帮助" className="flex flex-wrap gap-1 px-1 pt-1">
    {LEARNING_HELP.map(item => <Button key={item.id} type="button" variant="ghost" size="sm" disabled={disabled}
      className="h-auto min-h-8 whitespace-normal px-2 text-xs text-muted-foreground" onClick={() => onSelect(item.id)}>{item.label}</Button>)}
  </div>
}
