"use client";

import type { ComponentProps } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { announced, pct, progressOf } from "../utils/range";

export type AgentPlanStep = {
  id?: string | undefined;
  label: string;
  description?: string | undefined;
};

export function AgentPlan({
  steps,
  activeIndex,
  title = "计划",
  paused = false,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "steps" | "activeIndex"> & {
  steps: readonly (string | AgentPlanStep)[];
  activeIndex: number;
  title?: string | undefined;
  paused?: boolean | undefined;
}) {
  const total = steps.length;
  const completed = progressOf(activeIndex, total);
  const allDone = completed >= total;
  const progress = pct(completed, total);

  return (
    <div
      data-slot="agent-plan"
      className={cn("lx-card flex w-full max-w-[360px] flex-col px-4 py-3.5", className)}

      {...props}
    >
      <div className="flex items-center justify-between pb-2">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold">
          <span aria-hidden className="grid size-[22px] place-items-center rounded-[7px] bg-[rgb(123_92_201/12%)] text-[#7B5CC9]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
          </span>{title}
        </span>
        <span className="text-xs tabular-nums text-[#7B5CC9] dark:text-[#B19BEA]">{completed} / {total}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${title}进度`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={announced(progress)}
        aria-valuetext={`已完成 ${completed} / ${total} 步`}
        className="mb-2 h-[3px] w-full overflow-hidden rounded-sm bg-accent forced-colors:outline"
      >
        <span
          aria-hidden
          className="block h-full rounded-sm bg-[#7B5CC9] transition-[width] duration-500 forced-color-adjust-none motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ul className="flex flex-col">
        {steps.map((step, i) => {
          const item = typeof step === "string" ? { label: step } : step;
          const done = allDone || i < completed;
          const active = !allDone && i === completed;
          const status = done ? "已完成" : active ? paused ? "尚未完成" : "进行中" : "尚未开始";
          return (
            <li
              key={typeof step === "string" ? i : (step.id ?? i)}
              className={cn(
                "flex items-start gap-2.5 py-[5px] text-[13.5px]",
              )}
            >
              <span aria-hidden className="mt-px grid size-[18px] shrink-0 place-items-center">
                {done ? <span className="grid size-[18px] place-items-center rounded-full bg-[#7B5CC9] text-white"><CheckIcon strokeWidth={2.8} className="size-[11px]" /></span>
                  : active && !paused ? <span className="size-[18px] rounded-full border-2 border-[rgb(123_92_201/20%)] border-r-[#7B5CC9] border-t-[#7B5CC9] motion-safe:animate-spin" />
                  : <span className="size-[18px] rounded-full border-[1.5px] border-dashed border-input" />}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    done && "text-foreground",
                    active && "font-medium text-foreground",
                    !done && !active && "text-muted-foreground",
                  )}
                >
                  {item.label}
                </span>
                <span className="sr-only">{` ${status}`}</span>
                {active && item.description ? (
                  <span className="block text-[12.5px] text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
