"use client";

import type { ComponentProps } from "react";
import { pct, take } from "@/lib/range";
import { cn } from "@/lib/utils";
import { conversationCardSize, mono, paper } from "./surfaces";

export interface ScoreCriterion {
  label: string;
  score: number;
  weight: number;
  note?: string;
}

export function ScoreBreakdown({
  verdict,
  total,
  outOf,
  criteria,
  visibleCount,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "verdict" | "total" | "outOf" | "criteria" | "visibleCount"
> & {
  verdict: string;
  total: number;
  outOf: number;
  criteria: readonly ScoreCriterion[];
  visibleCount: number;
}) {
  const ratio = outOf === 0 ? 0 : total / outOf;

  return (
    <div
      data-slot="score-breakdown"
      className={cn(
        paper,
        conversationCardSize.wide,
        "flex flex-col gap-3 rounded-2xl p-4",
        className,
      )}

      {...props}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-medium tracking-tight tabular-nums">
          {total.toFixed(1)}
        </span>
        <span className={cn(mono, "text-foreground/30 tabular-nums")}>
          / {outOf}
        </span>
        <span
          className={cn(
            "ms-auto rounded-full px-2 py-0.5 text-xs font-medium",
            ratio >= 0.75
              ? "bg-primary/12 text-primary"
              : ratio >= 0.5
                ? "bg-chart-1/12 text-chart-1"
                : "bg-destructive/12 text-destructive",
          )}
        >
          {verdict}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {take(criteria, visibleCount).map((criterion) => (
          <div
            key={criterion.label}
            className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both flex flex-col gap-1 duration-300"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-foreground/75 min-w-0 flex-1 truncate text-[13px]">
                {criterion.label}
              </span>
              <span className={cn(mono, "text-foreground/25 shrink-0")}>
                ×{criterion.weight}
              </span>
              <span
                className={cn(mono, "text-foreground/55 shrink-0 tabular-nums")}
              >
                {criterion.score.toFixed(1)}
              </span>
            </div>
            <span className="bg-foreground/[0.06] h-[3px] w-full overflow-hidden rounded-full">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
                style={{
                  width: `${pct(criterion.score, outOf)}%`,
                }}
              />
            </span>
            {criterion.note && (
              <span className="text-foreground/40 text-xs leading-relaxed break-words">
                {criterion.note}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
