"use client";

import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  CollapsibleRoot as Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible-root";
import { collapsePanel, ShimmerLabel } from "./surfaces";

export type ToolTone = "read" | "write" | "attention" | "input" | "failed" | "idle";

const TONE: Record<ToolTone, { color: string; glyph: ReactNode }> = {
  read: { color: "#2B8A9E", glyph: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></> },
  write: { color: "#1F8A5B", glyph: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></> },
  attention: { color: "#B7791F", glyph: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></> },
  input: { color: "#3B6FD8", glyph: <><path d="M9 11h6M9 15h4" /><rect x="4" y="3" width="16" height="18" rx="2" /></> },
  failed: { color: "#C8463B", glyph: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></> },
  idle: { color: "#6B6B66", glyph: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></> },
};

/** Tinted 20px icon well shared by tool rows, search chips and process rows. */
export function ToolToneIcon({ tone, size = 20 }: { tone: ToolTone; size?: 20 | 22 | 24 }) {
  const { color, glyph } = TONE[tone];
  return <span aria-hidden="true" className="inline-grid shrink-0 place-items-center"
    style={{ width: size, height: size, borderRadius: size === 20 ? 6 : 7, background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-3">{glyph}</svg>
  </span>;
}

export type ToolHint = { tone: "waiting" | "syncing" | "failed" | "attention"; text: string; action?: { label: string; onClick: () => void } };

function Hint({ hint }: { hint: ToolHint }) {
  const color = hint.tone === "failed" ? "text-[#C8463B]" : hint.tone === "attention" ? "text-[#B7791F]" : "text-fg2";
  if (hint.tone === "attention") return <span className={cn("shrink-0 text-[11.5px]", color)}>{hint.text}</span>;
  return <span className={cn("inline-flex min-w-0 shrink items-center gap-1.5 text-xs", color)}>
    {hint.tone === "syncing"
      ? <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border-[1.5px] border-[rgb(59_111_216/25%)] border-t-[#3B6FD8] motion-safe:animate-spin" />
      : <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", hint.tone === "failed" ? "bg-[#C8463B]" : "bg-[#B7791F]")} />}
    <span className="truncate">{hint.text}</span>
    {hint.action && <button type="button" onClick={(event) => { event.stopPropagation(); hint.action!.onClick(); }}
      className="shrink-0 font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring">{hint.action.label}</button>}
  </span>;
}

export interface ToolCallProps {
  /** Human name of the step, e.g. 检索课程资料. */
  name: string;
  /** Machine name, shown in mono. */
  code?: string;
  /** Status word for assistive tech and the running shimmer. */
  statusLabel: string;
  tone: ToolTone;
  running: boolean;
  duration?: string;
  hint?: ToolHint;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Expanded body: purpose, badges, key/value grid, approval. */
  children?: ReactNode;
  className?: string;
}

export function ToolCall({ name, code, statusLabel, tone, running, duration, hint, open, onOpenChange, children, className }: ToolCallProps) {
  return (
    <Collapsible data-slot="tool-call" data-tone={tone} open={open} onOpenChange={onOpenChange} className={cn("w-full max-w-[620px]", className)}>
      <CollapsibleTrigger className="group/trigger focus-visible:ring-ring/50 flex h-7 w-full min-w-0 items-center gap-2 rounded-md text-start outline-none focus-visible:ring-2" disabled={!children}>
        <ToolToneIcon tone={tone} />
        <ShimmerLabel active={running} className={cn("relative shrink-0 whitespace-nowrap text-[13px] leading-none", tone === "failed" ? "text-[#C8463B]" : "text-foreground")}>{name}</ShimmerLabel>
        {code && <code className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">{code}</code>}
        <span className="sr-only">，{statusLabel}</span>
        <span className="flex-1" />
        {hint ? <Hint hint={hint} /> : duration && <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{duration}</span>}
        {children && <ChevronRightIcon aria-hidden="true" strokeWidth={2} className="size-3 shrink-0 text-input transition-transform duration-150 group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none" />}
      </CollapsibleTrigger>
      {children && <CollapsibleContent className={cn(collapsePanel, "outline-none")}>
        <div className="mb-1.5 ms-[9px] mt-0.5 flex flex-col gap-2 border-s border-border py-1 ps-[19px]">{children}</div>
      </CollapsibleContent>}
    </Collapsible>
  );
}

/** Mono key/value grid used inside an expanded tool row. */
export function ToolFields({ fields }: { fields: { label: string; value: string }[] }) {
  if (!fields.length) return null;
  return <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-2 gap-y-[3px] font-mono text-[11.5px] leading-[1.6]">
    {fields.map((field, index) => <div key={`${field.label}:${index}`} className="contents">
      <dt className="truncate text-muted-foreground">{field.label}</dt><dd className="break-words text-fg2">{field.value}</dd>
    </div>)}
  </dl>;
}
