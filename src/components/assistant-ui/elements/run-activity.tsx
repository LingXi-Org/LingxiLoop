"use client";

// Adapted from assistant-ui Elements (MIT). Source and local changes:
// third_party/assistant-ui-elements/README.md

import { createContext, type ReactNode, useContext, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TraceActivity } from "@/components/trace-waterfall/trace-activity";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CollapsibleRoot as Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible-root";
import { collapsePanel } from "./surfaces";
import type { ActivityTasks } from "@/lib/runActivity";
import { TaskCard, type TaskCardState, taskStateLabels } from "./task-card";

export type RunActivityStatus =
  | "running"
  | "requires-action"
  | "complete"
  | "cancelled"
  | "incomplete"
  | "error";

export type RunActivityEntry = {
  id: string;
  kind: "commentary" | "tool";
  label: string;
  content: ReactNode;
  /** Only a validated public task association; never inferred from a label. */
  taskId?: string;
  history?: boolean;
  revision?: boolean;
};

/** The agent's name row offers a slot so the run pill sits beside the name. */
export const RunActivityPillSlot = createContext<HTMLElement | null>(null);

const KIND_TONE = {
  commentary: { color: "#3B6FD8", label: "进展" },
  tool: { color: "#2B8A9E", label: "工具" },
} as const;
const STATUS_TONE: Record<RunActivityStatus, string> = {
  running: "var(--brand)",
  "requires-action": "#C08A1E",
  complete: "var(--brand)",
  cancelled: "var(--muted-foreground)",
  incomplete: "#C08A1E",
  error: "#C8463B",
};

export type RunActivityProps = {
  status: RunActivityStatus;
  statusLabel: string;
  /** Formatted from the caller's persisted run timing. */
  durationLabel?: ReactNode;
  entries: readonly RunActivityEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional trace detail remains inside the activity disclosure. */
  trace?: ReactNode;
  /** Read-only history navigation belongs to this same process disclosure. */
  historyControls?: ReactNode;
  tasks?: ActivityTasks["tasks"];
  /** Select an already authorized trace span after an explicit user action. */
  onInspectTask?: (taskId: string) => void;
  /** Pending decisions and recovery controls remain outside the disclosure. */
  attention?: ReactNode;
  /** Final-answer content remains outside the disclosure. */
  children?: ReactNode;
  className?: string;
};

export function RunActivity({
  status,
  statusLabel,
  durationLabel,
  entries,
  open,
  onOpenChange,
  attention,
  trace,
  historyControls,
  tasks,
  onInspectTask,
  children,
  className,
}: RunActivityProps) {
  const anchorPrefix = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const entryAnchor = (id: string) => `${anchorPrefix}-${encodeURIComponent(id)}`;
  const latestActivity =
    status === "running"
      ? entries.findLast((entry) => !entry.history && !entry.revision && entry.label.trim())?.label
      : undefined;

  const pillSlot = useContext(RunActivityPillSlot);
  const hasDisclosure = entries.length > 0 || trace || historyControls || tasks?.length;
  const summary = (
    <span className="shrink-0 whitespace-nowrap text-start tabular-nums">
      {statusLabel}
      {durationLabel != null && <> · {durationLabel}</>}
    </span>
  );
  const trigger = (
    <CollapsibleTrigger
      aria-busy={status === "running"}
      className="group/trigger text-muted-foreground hover:bg-accent focus-visible:ring-ring/50 data-open:bg-accent data-panel-open:bg-accent flex h-[26px] max-w-full items-center gap-1 rounded-full ps-1.5 pe-2 text-[12.5px] outline-none focus-visible:ring-[3px]"
    >
      <ChevronRightIcon
        aria-hidden="true"
        strokeWidth={1.8}
        className="size-3.5 shrink-0 transition-transform duration-150 group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none"
      />
      {status === "running" && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-brand motion-safe:animate-pulse" />}
      {summary}
      {!open && latestActivity && <span className="min-w-0 max-w-64 truncate text-start" title={latestActivity}>
        <span aria-hidden="true">· </span>{latestActivity}
      </span>}
    </CollapsibleTrigger>
  );

  return (
    <div
      data-slot="run-activity"
      data-status={status}
      className={cn("flex min-w-0 flex-col gap-3.5", className)}
    >
      {hasDisclosure ? (
        <Collapsible open={open} onOpenChange={onOpenChange}>
          {pillSlot ? createPortal(trigger, pillSlot) : trigger}
          <CollapsibleContent className={cn(collapsePanel, "peer")}>
            <section aria-label="活动记录" className="ps-0.5 pt-0.5">
              {entries.length > 0 && <>
                <div className="flex items-center gap-2.5 pb-2">
                  <div aria-hidden="true" className="flex flex-1 gap-0.5">
                    {entries.map((entry) => <span key={entry.id} className="h-1 flex-1 rounded-sm opacity-90" style={{ background: entry.history ? "#8A8A85" : KIND_TONE[entry.kind].color, opacity: entry.history ? 0.35 : 0.9 }} />)}
                  </div>
                  <span className="inline-flex items-center gap-[5px] text-xs" style={{ color: STATUS_TONE[status] }}>
                    <span className="size-1.5 rounded-full" style={{ background: STATUS_TONE[status] }} />{statusLabel}
                  </span>
                  {durationLabel != null && <span className="font-mono text-[11.5px] tabular-nums text-fg2">{durationLabel}</span>}
                </div>
                <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 pb-3 text-[11.5px] text-muted-foreground">
                  {(Object.keys(KIND_TONE) as (keyof typeof KIND_TONE)[]).filter((kind) => entries.some((entry) => entry.kind === kind)).map((kind) =>
                    <span key={kind} className="inline-flex items-center gap-[5px]"><span className="size-1.5 rounded-full" style={{ background: KIND_TONE[kind].color }} />{KIND_TONE[kind].label}</span>)}
                </div>
              </>}
              {!!tasks?.length && <ActivityTaskTree tasks={tasks} entries={entries} entryAnchor={entryAnchor}
                onInspectTask={trace && onInspectTask ? id => {
                  if (details.current) details.current.open = true;
                  onInspectTask(id);
                } : undefined} />}
              {historyControls && <div className="min-w-0 pb-2 ps-[34px]" data-slot="run-activity-history">{historyControls}</div>}
              {entries.length > 0 && <ol className="m-0 flex min-w-0 list-none flex-col p-0 text-[13px] leading-[1.65] wrap-anywhere">
                {entries.map((entry, index) => {
                  const tone = KIND_TONE[entry.kind];
                  return <li key={entry.id} id={entryAnchor(entry.id)} tabIndex={-1} data-activity-kind={entry.kind} data-task-id={entry.taskId}
                    className="relative flex scroll-mt-4 gap-3 rounded-md pb-3.5 pt-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {index < entries.length - 1 && <span aria-hidden="true" className="absolute bottom-0 start-[11.5px] top-[30px] w-px bg-border" />}
                    <span aria-hidden="true" title={tone.label} className="relative z-[1] grid size-6 shrink-0 place-items-center rounded-[7px]" style={{ background: `color-mix(in srgb, ${tone.color} 13%, transparent)`, color: tone.color }}>
                      {entry.kind === "tool"
                        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-2.4z" /></svg>
                        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><path d="M4 12h4l3-8 4 16 3-8h2" /></svg>}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1 pt-[3px]">
                      <div className="min-w-0 text-fg2">{entry.content}</div>
                    </div>
                  </li>;
                })}
              </ol>}
              {trace && <details ref={details} onToggle={event => setDetailsOpen(event.currentTarget.open)} data-slot="run-activity-details" className="group/details min-w-0 pt-1 ps-[34px]">
                <summary className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex h-6 w-fit max-w-full cursor-pointer list-none items-center gap-1.5 rounded-md text-xs outline-none focus-visible:ring-[3px] [&::-webkit-details-marker]:hidden">
                  <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 transition-transform duration-200 group-open/details:rotate-90 motion-reduce:transition-none" />
                  运行详情
                </summary>
                <TraceActivity.Provider value={open && detailsOpen}><div className="min-w-0 pt-2">{trace}</div></TraceActivity.Provider>
              </details>}
            </section>
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <p className="text-muted-foreground py-1 text-[12.5px]">{summary}</p>
      )}
      {/* Announce the settled duration without announcing streaming timer ticks. */}
      <span role="status" aria-atomic="true" className="sr-only">
        {statusLabel}
        {status !== "running" && durationLabel != null && <> {durationLabel}</>}
      </span>
      {attention}
      {children}
    </div>
  );
}

const taskState = (status: ActivityTasks["tasks"][number]["status"]): TaskCardState =>
  status === "running" ? "working" : status === "complete" ? "done" : status === "error" ? "failed" : status;

/** Task cards are navigation, not a second copy or a reordering of activities. */
function ActivityTaskTree({ tasks, entries, entryAnchor, onInspectTask }: {
  tasks: ActivityTasks["tasks"]; entries: readonly RunActivityEntry[]; entryAnchor: (id: string) => string;
  onInspectTask?: (taskId: string) => void;
}) {
  const renderTasks = (parentId?: string): ReactNode => <ul className={cn("grid min-w-0 gap-2", parentId && "border-border border-s ps-2")}>
    {tasks.filter(task => task.parentId === parentId).map(task => {
      const linked = entries.filter(entry => entry.taskId === task.id);
      const descendants = tasks.some(child => child.parentId === task.id);
      const state = taskState(task.status);
      return <li key={task.id} data-task-parent={task.parentId}>
        <TaskCard data-task-id={task.id} label={task.label} state={state} meta={taskStateLabels[state]} className="max-w-none"
          actions={onInspectTask && <button type="button" onClick={() => onInspectTask(task.id)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm text-sm underline underline-offset-4 outline-none focus-visible:ring-2">查看调用</button>}>
          {linked.length > 0 && <ul aria-label="任务活动" className="grid min-w-0 gap-2 text-sm">
            {linked.map(entry => <li key={entry.id}><a href={`#${entryAnchor(entry.id)}`}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm underline underline-offset-4 outline-none focus-visible:ring-2 wrap-anywhere">
              {entry.label || "查看活动"}
            </a></li>)}
          </ul>}
          {descendants && renderTasks(task.id)}
        </TaskCard>
      </li>;
    })}
  </ul>;
  return <nav aria-label="任务" className="min-w-0 pt-2" data-slot="run-activity-tasks">{renderTasks()}</nav>;
}
