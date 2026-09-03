"use client"

import { ArrowRightIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "@/lib/utils"
import { conversationCardSize, field } from "./surfaces"

export function AgentHandoff({
  from,
  to,
  fromAvatar,
  toAvatar,
  settled,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "from" | "to" | "fromAvatar" | "toAvatar" | "settled"
> & {
  from: string
  to: string
  fromAvatar: ReactNode
  toAvatar: ReactNode
  settled: boolean
}) {
  return (
    <div
      data-slot="agent-handoff"
      className={cn(conversationCardSize.inline, "flex items-center", className)}
      {...props}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            field,
            "text-foreground/45 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-opacity duration-500",
            settled && "opacity-45",
          )}
        >
          {fromAvatar}
          {from}
        </span>
        <ArrowRightIcon
          className={cn(
            "size-3.5 shrink-0 transition-colors duration-500",
            settled ? "text-foreground/25" : "text-primary",
          )}
        />
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors duration-500",
            settled
              ? cn(field, "text-foreground/80")
              : "bg-primary/12 text-primary",
          )}
        >
          {toAvatar}
          {to}
        </span>
      </div>
    </div>
  )
}
