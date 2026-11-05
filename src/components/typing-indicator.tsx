"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

const DOT_DELAYS = ["-0.32s", "-0.16s", "0s"];

export function TypingIndicator({
  variant = "bubble",
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "variant" | "role" | "aria-label"
> & {
  variant?: "bubble" | "bare";
}) {
  const dots = DOT_DELAYS.map((delay) => (
    <span
      key={delay}
      aria-hidden
      className="typing-dot size-[5px] rounded-full bg-[#3B6FD8] dark:bg-[#7FA3EC]"
      style={{ animationDelay: delay }}
    />
  ));

  if (variant === "bare") {
    return (
      <div
        data-slot="typing-indicator"
        data-variant="bare"
        role="status"
        aria-label="正在回复"
        className={cn("flex items-center", className)}
        {...props}
      >
        <span className="inline-flex items-center gap-1 rounded-xl bg-formula px-2.5 py-2">{dots}</span>
      </div>
    );
  }

  return (
    <div
      data-slot="typing-indicator"
      data-variant="bubble"
      className={cn(paper, "w-fit rounded-full px-4 py-3.5", className)}
      {...props}
    >
      <div
        role="status"
        aria-label="正在回复"
        className="flex gap-1"
      >
        {dots}
      </div>
    </div>
  );
}
