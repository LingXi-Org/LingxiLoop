"use client";

import { CheckIcon, PauseIcon, RotateCcwIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { conversationCardSize, ghostButton, mono, paper } from "./surfaces";

export type AgentState = "working" | "waiting" | "done";

export interface StatusStep {
  state: AgentState;
  label: string;
}

export function AgentStatus({
  state,
  label,
  elapsed,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "state" | "label" | "elapsed"> & {
  state: AgentState;
  label: string;
  elapsed?: string;
}) {
  return (
    <div
      data-slot="agent-status"
      className={cn(
        paper,
        conversationCardSize.inline,
        "flex items-center gap-2.5 rounded-full py-1.5 ps-3.5 pe-1.5",
        className,
      )}

      {...props}
    >
      {state === "done" ? (
        <CheckIcon aria-hidden className="size-3 shrink-0 text-primary" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full motion-reduce:animate-none",
            state === "working"
              ? "animate-pulse bg-primary"
              : "bg-foreground/25 animate-pulse",
          )}
        />
      )}
      <span
        key={label}
        className="fade-in blur-in-[2px] animate-in max-w-44 truncate text-xs duration-300 motion-reduce:animate-none"
      >
        {label}
      </span>
      {elapsed !== undefined && state !== "done" && (
        <span className={cn(mono, "text-foreground/30 tabular-nums")}>
          {elapsed}
        </span>
      )}
      <button
        type="button"
        aria-label={state === "done" ? "重新运行" : "暂停智能体"}
        className={cn(ghostButton, "size-6")}
      >
        {state === "done" ? (
          <RotateCcwIcon className="size-3" />
        ) : (
          <PauseIcon className="size-3" />
        )}
      </button>
    </div>
  );
}
