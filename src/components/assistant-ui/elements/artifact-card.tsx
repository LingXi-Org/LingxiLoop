"use client"
import { MessageFooterContents } from '../message-footer'

import { FileTextIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "@/lib/utils"
import { conversationCardSize, mono, ShimmerLabel } from "./surfaces"

export function ArtifactCard({
  title,
  meta,
  generating = false,
  words = 0,
  preview,
  icon,
  onOpen,
  openLabel = "打开",
  opened = false,
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
  /** The artifact is already showing beside the conversation. */
  opened?: boolean
}) {
  return (
    <div
      data-slot="artifact-card"
      className={cn(
        preview ? conversationCardSize.standard : "w-full max-w-[440px]",
        "group overflow-hidden rounded-xl border border-border bg-card text-foreground",
        className,
      )}
      {...props}
    >
      <MessageFooterContents>{preview && <div data-slot="artifact-preview" className="relative aspect-video overflow-hidden bg-muted">{preview}</div>}
      <div className="flex items-center gap-3 px-3 py-2.5">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-[9px] border border-border bg-canvas text-fg2 [&_svg]:size-[18px]">
        {icon ?? <FileTextIcon className={cn("size-4", generating && "animate-pulse motion-reduce:animate-none")} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {generating ? (
          <p className={cn(mono, "text-foreground/40 flex items-center gap-1")}>
            <ShimmerLabel className="relative inline-block leading-none">正在生成</ShimmerLabel>
            <span>·</span>
            <span className="tabular-nums">{words} 字</span>
          </p>
        ) : (
          <p className="truncate text-[12.5px] text-muted-foreground">{meta}</p>
        )}
      </div>
      {onOpen && <button type="button" className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-[12.5px] text-fg2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11" onClick={onOpen} aria-label={`${openLabel}：${title}`} aria-pressed={opened || undefined}>{opened ? "已打开" : "打开"}</button>}
      </div>
      </MessageFooterContents>
    </div>
  )
}
