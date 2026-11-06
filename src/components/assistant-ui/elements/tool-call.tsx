"use client";

import { CheckIcon, ChevronRightIcon, CircleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CollapsibleRoot as Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible-root";
import { collapsePanel, ShimmerLabel, SwapLabel } from "./surfaces";

export interface ToolCallProps {
  label: string;
  activeLabel: string;
  query: string;
  request: string;
  result: string;
  running: boolean;
  outcome?: 'complete' | 'failed' | 'pending';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

export function ToolCall({
  label,
  activeLabel,
  query,
  request,
  result,
  running,
  outcome = 'complete',
  open,
  onOpenChange,
  className,
}: ToolCallProps) {
  return (
    <Collapsible
      data-slot="tool-call"
      open={open}
      onOpenChange={onOpenChange}
      className={cn("w-full max-w-[400px]", className)}
    >
      <CollapsibleTrigger className="group/trigger focus-visible:ring-ring/50 flex h-7 w-full items-center gap-2 rounded-md text-[13px] outline-none focus-visible:ring-2">
        <span aria-hidden="true" className={cn("grid size-5 shrink-0 place-items-center rounded-md",
          outcome === "failed" && !running ? "bg-[rgb(200_70_59/12%)] text-[#C8463B]" : "bg-[rgb(43_138_158/12%)] text-[#2B8A9E]")}>
          {outcome === "failed" && !running ? <CircleAlertIcon strokeWidth={1.9} className="size-3" />
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-3"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>}
        </span>
        <SwapLabel active={running ? 0 : 1} className={cn("shrink-0 text-start whitespace-nowrap", outcome === "failed" && !running ? "text-[#C8463B]" : "text-foreground")}>
          <ShimmerLabel active={running} className="relative inline-block leading-none">{activeLabel}</ShimmerLabel>
          <>{label}</>
        </SwapLabel>
        <code className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">{query}</code>
        <span className="flex-1" />
        {!running && outcome === "complete" && <CheckIcon aria-label="已完成" className="fade-in zoom-in-90 animate-in size-3 shrink-0 text-brand duration-200" />}
        {!running && outcome === "failed" && <span className="sr-only">未完成</span>}
        <ChevronRightIcon aria-hidden="true" strokeWidth={2} className="size-3 shrink-0 text-input transition-transform duration-150 group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none" />
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(collapsePanel, "outline-none")}>
        <div className="ms-[9px] mt-0.5 grid grid-cols-[34px_minmax(0,1fr)] gap-x-1.5 gap-y-1 border-s border-border py-1 ps-[19px] font-mono text-[11.5px] leading-[1.6]">
          <span className="text-muted-foreground">in</span><span className="break-words text-fg2">{request}</span>
          <span className="text-muted-foreground">out</span><span className="break-words text-fg2">{result}</span>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
