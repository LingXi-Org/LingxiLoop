"use client";

// Adapted from assistant-ui Elements (MIT). Original source and local changes:
// third_party/assistant-ui-elements/README.md

import { Children, type ComponentProps, type ReactNode, useState } from "react";
import {
  Ban,
  CheckIcon,
  ChevronRightIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";

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
  if (state === "done") {
    return (
      <CheckIcon
        aria-hidden
        className={cn("size-3.5 shrink-0 text-emerald-500", className)}
      />
    );
  }
  if (state === "failed") {
    return (
      <XIcon
        aria-hidden
        className={cn("text-destructive size-3.5 shrink-0", className)}
      />
    );
  }
  if (state === "cancelled") {
    return (
      <Ban
        aria-hidden
        className={cn("text-muted-foreground size-3.5 shrink-0", className)}
      />
    );
  }
  if (state === "working") {
    return (
      <Loader2Icon
        aria-hidden
        className={cn(
          "text-muted-foreground size-3.5 shrink-0 animate-spin motion-reduce:animate-none",
          className,
        )}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "border-foreground/35 m-1 size-1.5 shrink-0 rounded-full border",
        className,
      )}
    />
  );
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
        paper,
        "flex w-full min-w-0 max-w-sm flex-col overflow-hidden rounded-2xl",
        className,
      )}
      {...props}
    >
      <button
        type="button"
        aria-expanded={hasTranscript ? isOpen : undefined}
        disabled={!hasTranscript || inert}
        onClick={toggle}
        className="hover:enabled:bg-foreground/[0.03] focus-visible:ring-ring/50 flex min-w-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-start outline-none transition-colors focus-visible:ring-[3px] motion-reduce:transition-none disabled:cursor-default"
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
