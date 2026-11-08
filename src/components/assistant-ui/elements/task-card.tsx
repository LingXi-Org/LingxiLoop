"use client";

// Adapted from assistant-ui Elements (MIT). Original source and local changes:
// third_party/assistant-ui-elements/README.md

import { Children, type ComponentProps, type ReactNode, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";

export type TaskCardState =
  | "working"
  | "waiting"
  | "done"
  | "failed"
  | "cancelled"
  | "partial"
  | "blocked"
  | "unknown";

export const taskStateLabels: Record<TaskCardState, string> = {
  working: "进行中", waiting: "等待中", done: "已完成", failed: "失败",
  cancelled: "已取消", partial: "部分完成", blocked: "受阻", unknown: "—",
};

const isRenderable = (node: ReactNode) =>
  node !== undefined && node !== null && node !== false && node !== true;

export function TaskStateIcon({
  state,
  className,
}: {
  state: TaskCardState;
  className?: string;
}) {
  const tone = state === "done" ? "border-[#1F8A5B] bg-[#1F8A5B]"
    : state === "working" ? "border-[#3B6FD8] bg-[#3B6FD8] motion-safe:animate-pulse"
    : state === "failed" ? "border-[#C8463B] bg-[#C8463B]"
    : state === "cancelled" ? "border-muted-foreground bg-muted-foreground/40"
    : "border-input bg-transparent";
  return <span aria-hidden className={cn("m-[3px] size-2 shrink-0 rounded-full border-[1.5px]", tone, className)} />;
}

export function TaskCard({
  label,
  meta,
  state,
  elapsed,
  actions,
  result,
  open,
  onOpenChange,
  children,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "label" | "state" | "result" | "open" | "onOpenChange"
> & {
  label: string;
  meta?: string | undefined;
  state: TaskCardState;
  elapsed?: string | undefined;
  actions?: ReactNode | undefined;
  result?: ReactNode | undefined;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  children?: ReactNode | undefined;
}) {
  const hasTranscript = Children.toArray(children).length > 0;
  const inert = open !== undefined && onOpenChange === undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div
      data-slot="task-card"
      data-state={state}
      className={cn(
        "lx-card flex w-full min-w-0 max-w-[380px] flex-col overflow-hidden",
        className,
      )}
      {...props}
    >
      <button
        type="button"
        aria-expanded={hasTranscript ? isOpen : undefined}
        disabled={!hasTranscript || inert}
        onClick={toggle}
        className="hover:enabled:bg-accent/50 focus-visible:ring-ring/50 flex min-h-[30px] min-w-0 items-center gap-2 rounded-[14px] px-3.5 py-1.5 text-start outline-none transition-colors focus-visible:ring-[3px] motion-reduce:transition-none disabled:cursor-default"
      >
        <TaskStateIcon state={state} />
        <span className="sr-only">{taskStateLabels[state]}</span>
        <span className="min-w-0 flex-1 text-[13.5px] wrap-anywhere">{label}</span>
        {meta !== undefined && (
          <span
            className={cn(
              mono,
              "text-muted-foreground max-w-24 shrink-0 truncate",
            )}
          >
            {meta}
          </span>
        )}
        {elapsed !== undefined && (
          <span
            className={cn(mono, "text-muted-foreground shrink-0 tabular-nums")}
          >
            {elapsed}
          </span>
        )}
        {hasTranscript && (
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "text-muted-foreground size-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
              isOpen && "rotate-90",
            )}
          />
        )}
      </button>
      {isRenderable(actions) && (
        <div
          data-slot="task-card-actions"
          className="border-border/60 border-t px-3.5 py-2.5"
        >
          {actions}
        </div>
      )}
      {hasTranscript && isOpen && (
        <div
          data-slot="task-card-transcript"
          className="border-border/60 flex flex-col gap-2 border-t px-3.5 py-2.5"
        >
          {children}
        </div>
      )}
      {isRenderable(result) && (
        <div
          data-slot="task-card-result"
          className="border-border/60 text-foreground/70 border-t px-3.5 py-2 text-xs leading-relaxed"
        >
          {result}
        </div>
      )}
    </div>
  );
}
