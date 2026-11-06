"use client";

import type { ComponentProps } from "react";
import { BrainIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostButton } from "./surfaces";

export type MemoryChange = "added" | "updated" | "existing";

export interface MemoryChip {
  id: string;
  text: string;
  change: MemoryChange;
}

export function MemoryChips({
  chips,
  onForget,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "chips" | "onForget"> & {
  chips: readonly MemoryChip[];
  onForget?: (id: string) => void;
}) {
  const fresh = chips.filter((chip) => chip.change !== "existing").length;

  return (
    <div
      data-slot="memory-chips"
      className={cn("flex w-full max-w-[620px] flex-col gap-2", className)}

      {...props}
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="grid size-5 place-items-center rounded-md bg-[rgb(123_92_201/12%)] text-[#7B5CC9]"><BrainIcon className="size-3" /></span>
        <span className="text-xs text-muted-foreground">
          {fresh > 0 ? `已更新 ${fresh} 条记忆` : "记忆"}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip.id}
            className={cn(
              "fade-in zoom-in-95 animate-in fill-mode-both group flex h-7 items-center gap-1 rounded-full pe-1 ps-2.5 text-[12.5px] duration-300",
              chip.change === "existing"
                ? "text-fg2 shadow-[inset_0_0_0_1px_var(--border)]"
                : "bg-brand-surface text-brand",
            )}
          >
            {chip.text}
            {onForget && (
              <button
                type="button"
                aria-label={`忘记“${chip.text}”`}
                onClick={() => onForget(chip.id)}
                className={cn(ghostButton, "size-4")}
              >
                <XIcon className="size-2.5" />
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
