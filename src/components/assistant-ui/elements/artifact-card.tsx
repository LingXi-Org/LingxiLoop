"use client"

import { ArrowUpRightIcon, FileTextIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { conversationCardSize, mono, paper, ShimmerLabel } from "./surfaces"

export function ArtifactCard({
  title,
  meta,
  generating = false,
  words = 0,
  preview,
  icon,
  onOpen,
  openLabel = "打开",
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "title" | "meta" | "generating" | "words"> & {
  title: string
  meta: string
  generating?: boolean
  words?: number
  preview?: ReactNode
  icon?: ReactNode
  onOpen?: () => void
  openLabel?: string
}) {
  return (
    <div
      data-slot="artifact-card"
      className={cn(
        paper,
        preview ? conversationCardSize.standard : conversationCardSize.compact,
        "group overflow-hidden rounded-[6px_18px_18px_6px] text-foreground",
        className,
      )}
      {...props}
    >
      {preview && <div data-slot="artifact-preview" className="relative aspect-video overflow-hidden bg-muted">{preview}</div>}
      <div className="flex items-center gap-3 p-3.5">
      <span aria-hidden className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4">
        {icon ?? <FileTextIcon className={cn("size-4", generating && "animate-pulse motion-reduce:animate-none")} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">{title}</p>
        {generating ? (
          <p className={cn(mono, "text-foreground/40 flex items-center gap-1")}>
            <ShimmerLabel className="relative inline-block leading-none">正在生成</ShimmerLabel>
            <span>·</span>
            <span className="tabular-nums">{words} 字</span>
          </p>
        ) : (
          <p className={cn(mono, "text-muted-foreground")}>{meta}</p>
        )}
      </div>
      </div>
      {onOpen && <div className="flex justify-end px-3.5 pb-3.5"><Button type="button" size="sm" onClick={onOpen} aria-label={`${openLabel}：${title}`}>{openLabel}<ArrowUpRightIcon aria-hidden className="size-3.5" /></Button></div>}
    </div>
  )
}
