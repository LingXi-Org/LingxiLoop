"use client"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { userFacingError } from "@/lib/userFacingError"
import {
  ArrowDown01Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  CodeIcon,
  DatabaseIcon,
  GlobalIcon,
  Loading03Icon,
  Mail01Icon,
  PaintBrush01Icon,
  Settings02Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

export type ToolService = "web" | "code" | "data" | "design" | "communication" | "automation"

export type ToolPart = {
  type: string
  service?: ToolService
  state: "input-streaming" | "input-available" | "output-available" | "output-error"
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  toolCallId?: string
  errorText?: string
}

export type ToolProps = {
  toolPart: ToolPart
  defaultOpen?: boolean
  className?: string
}

const serviceStyle = {
  web: { icon: GlobalIcon, color: "text-chart-1" },
  code: { icon: CodeIcon, color: "text-chart-2" },
  data: { icon: DatabaseIcon, color: "text-chart-3" },
  design: { icon: PaintBrush01Icon, color: "text-chart-4" },
  communication: { icon: Mail01Icon, color: "text-chart-5" },
  automation: { icon: SparklesIcon, color: "text-primary" },
} satisfies Record<ToolService, { icon: typeof Settings02Icon; color: string }>

const SERVICE_LABELS: Record<ToolService, string> = {
  web: "网页工具",
  code: "代码工具",
  data: "数据工具",
  design: "设计工具",
  communication: "沟通工具",
  automation: "自动化工具",
}

const openToolCalls = new Set<string>()

const Tool = ({ toolPart, defaultOpen = false, className }: ToolProps) => {
  const { state, input, output, toolCallId } = toolPart
  const openKey = toolCallId ?? `${toolPart.service ?? "tool"}:${toolPart.type}`
  const toolLabel = toolPart.service ? SERVICE_LABELS[toolPart.service] : "工具调用"
  const [isOpen, setIsOpen] = useState(() => defaultOpen || openToolCalls.has(openKey))

  const toggleOpen = () => {
    setIsOpen((open) => {
      const next = !open
      if (next) openToolCalls.add(openKey)
      else openToolCalls.delete(openKey)
      return next
    })
  }

  const getStateIcon = () => {
    if (toolPart.service) {
      const service = serviceStyle[toolPart.service]
      return <HugeiconsIcon icon={service.icon} strokeWidth={2} className={cn("size-4", service.color)} />
    }
    switch (state) {
      case "input-streaming": return <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin text-primary" />
      case "input-available": return <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} className="size-4 text-chart-3" />
      case "output-available": return <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-4 text-primary" />
      case "output-error": return <HugeiconsIcon icon={CancelCircleIcon} strokeWidth={2} className="size-4 text-destructive" />
      default: return <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
    }
  }

  const getStateBadge = () => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium"
    switch (state) {
      case "input-streaming": return <span className={cn(baseClasses, "bg-primary/10 text-primary")}>执行中</span>
      case "input-available": return <span className={cn(baseClasses, "bg-chart-3/10 text-chart-3")}>准备就绪</span>
      case "output-available": return <span className={cn(baseClasses, "bg-primary/10 text-primary")}>已完成</span>
      case "output-error": return <span className={cn(baseClasses, "bg-destructive/10 text-destructive")}>执行失败</span>
      default: return <span className={cn(baseClasses, "bg-muted text-muted-foreground")}>等待中</span>
    }
  }

  const formatValue = (value: unknown): string => {
    if (value === null) return "无"
    if (value === undefined) return "未提供"
    if (typeof value === "boolean") return value ? "是" : "否"
    if (typeof value === "string") return value
    if (typeof value === "object") return JSON.stringify(value, null, 2)
    return String(value)
  }

  return (
    <div
      data-slot="tool"
      data-tool-state={state}
      data-tool-scope={toolPart.service}
      className={cn("border-border mt-3 overflow-hidden rounded-lg border", className)}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            aria-label={isOpen ? `收起${toolLabel}` : `展开${toolLabel}`}
            onClick={(event) => {
              event.preventDefault()
              toggleOpen()
            }}
            className={cn(buttonVariants({ variant: "ghost" }), "bg-background h-auto w-full justify-between rounded-b-none px-3 py-2 font-normal")}
          >
            <div className="flex min-w-0 items-center gap-2">
              {getStateIcon()}
              <span className="truncate text-sm font-medium">{toolLabel}</span>
              {getStateBadge()}
            </div>
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className={cn("size-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className={cn("border-border border-t", "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden")}>
          <div className="bg-background space-y-3 p-3">
            {input && Object.keys(input).length > 0 && <div>
              <h4 className="text-muted-foreground mb-2 text-sm font-medium">执行参数</h4>
              <div className="bg-background rounded border p-2 font-mono text-sm">
                {Object.entries(input).map(([key, value]) => <div key={key} className="mb-1 last:mb-0"><span className="text-muted-foreground">{key}:</span>{" "}<span className="break-words">{formatValue(value)}</span></div>)}
              </div>
            </div>}
            {output && <div>
              <h4 className="text-muted-foreground mb-2 text-sm font-medium">执行结果</h4>
              <div className="bg-background max-h-60 overflow-auto rounded border p-2 font-mono text-sm"><pre className="whitespace-pre-wrap break-words">{formatValue(output)}</pre></div>
            </div>}
            {state === "output-error" && toolPart.errorText && <div>
              <h4 className="mb-2 text-sm font-medium text-destructive">错误信息</h4>
              <div className="rounded border border-destructive/20 bg-destructive/5 p-2 text-sm">{userFacingError(toolPart.errorText, "工具执行失败，请稍后重试。")}</div>
            </div>}
            {state === "input-streaming" && <div className="text-muted-foreground text-sm">正在调用工具能力…</div>}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export { Tool }
