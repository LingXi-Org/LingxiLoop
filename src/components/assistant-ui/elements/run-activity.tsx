"use client";

// Adapted from assistant-ui Elements (MIT). Source and local changes:
// third_party/assistant-ui-elements/README.md

import { type ReactNode, useId, useRef } from "react";
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
  const entryAnchor = (id: string) => `${anchorPrefix}-${encodeURIComponent(id)}`;
  const latestActivity =
    status === "running"
      ? entries.findLast((entry) => !entry.history && !entry.revision && entry.label.trim())?.label
      : undefined;

  const summary = (
    <span className="shrink-0 whitespace-nowrap text-start tabular-nums">
      {statusLabel}
      {durationLabel != null && <> {durationLabel}</>}
    </span>
  );

  return (
    <div
      data-slot="run-activity"
      data-status={status}
      className={cn("flex min-w-0 flex-col gap-3", className)}
    >
      {entries.length > 0 || trace || historyControls || tasks?.length ? (
        <Collapsible open={open} onOpenChange={onOpenChange}>
          <CollapsibleTrigger
            aria-busy={status === "running"}
            className="group/trigger text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex max-w-full items-center gap-1.5 rounded-md py-1 text-sm outline-none focus-visible:ring-[3px]"
          >
            <ChevronRightIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 transition-transform duration-200 group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none"
            />
            {summary}
            {!open && latestActivity && <span className="min-w-0 truncate text-start" title={latestActivity}>
              <span aria-hidden="true">· </span>{latestActivity}
            </span>}
          </CollapsibleTrigger>
          <CollapsibleContent className={cn(collapsePanel, "peer")}>
            {!!tasks?.length && <ActivityTaskTree tasks={tasks} entries={entries} entryAnchor={entryAnchor}
              onInspectTask={trace && onInspectTask ? id => {
                if (details.current) details.current.open = true;
                onInspectTask(id);
              } : undefined} />}
            {entries.length > 0 && <ol className="border-border ms-1.5 flex min-w-0 flex-col gap-3 border-s ps-3.5 pt-2 text-sm wrap-anywhere">
              {entries.map((entry) => (
                <li key={entry.id} id={entryAnchor(entry.id)} tabIndex={-1} data-activity-kind={entry.kind} data-task-id={entry.taskId}
                  className="scroll-mt-4 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {entry.content}
                </li>
              ))}
            </ol>}
            {historyControls && <div className="min-w-0 pt-3" data-slot="run-activity-history">{historyControls}</div>}
            {trace && <details ref={details} data-slot="run-activity-details" className="group/details min-w-0 pt-3">
              <summary className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex w-fit max-w-full cursor-pointer list-none items-center gap-1.5 rounded-md py-1 text-sm outline-none focus-visible:ring-[3px] [&::-webkit-details-marker]:hidden">
                <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 transition-transform duration-200 group-open/details:rotate-90 motion-reduce:transition-none" />
                运行详情
              </summary>
              <div className="min-w-0 pt-2">{trace}</div>
            </details>}
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <p className="text-muted-foreground py-1 text-sm">{summary}</p>
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
