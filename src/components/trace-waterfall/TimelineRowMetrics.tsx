/** Adapted from Langfuse TimelineRowMetrics (MIT), see NOTICE.md.
 * A dedicated column keeps duration/cost readable at every bar width and theme. */
export type RowMetrics = {
  durationText: string;
  costText?: string;
};

export function TimelineRowMetrics({ durationText,costText }: RowMetrics) {
  return <div className="flex h-8 min-w-0 flex-col items-end justify-center overflow-hidden pe-1 font-mono tabular-nums"
    data-testid="timeline-dense-metrics" data-placement="column" title={[durationText,costText].filter(Boolean).join(' · ')}>
    <span className="text-foreground max-w-full truncate text-[11px] leading-4" data-testid="timeline-dense-duration" data-placement="column">
      {durationText}
    </span>
    {costText && <span className="text-muted-foreground max-w-full truncate text-[10px] leading-3">{costText}</span>}
  </div>
}
