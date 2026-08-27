"use client"

import { buttonVariants } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  CheckCircle,
  ChevronDown,
  Code2,
  Database,
  Globe2,
  Loader2,
  Mail,
  Palette,
  Settings,
  Sparkles,
  XCircle,
} from "lucide-react"
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
  web: { icon: Globe2, color: "text-sky-500" },
  code: { icon: Code2, color: "text-violet-500" },
  data: { icon: Database, color: "text-amber-500" },
  design: { icon: Palette, color: "text-fuchsia-500" },
  communication: { icon: Mail, color: "text-emerald-500" },
  automation: { icon: Sparkles, color: "text-[#4682f6]" },
} satisfies Record<ToolService, { icon: typeof Settings; color: string }>

const openToolCalls = new Set<string>()

const Tool = ({ toolPart, defaultOpen = false, className }: ToolProps) => {
  const { state, input, output, toolCallId } = toolPart
  const openKey = toolCallId ?? `${toolPart.service ?? "tool"}:${toolPart.type}`
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
      const ServiceIcon = service.icon
      return <ServiceIcon className={cn("h-4 w-4", service.color)} />
    }
    switch (state) {
      case "input-streaming": return <Loader2 className="h-4 w-4 animate-spin text-[#4682f6]" />
      case "input-available": return <Settings className="h-4 w-4 text-orange-500" />
      case "output-available": return <CheckCircle className="h-4 w-4 text-green-500" />
      case "output-error": return <XCircle className="h-4 w-4 text-red-500" />
      default: return <Settings className="text-muted-foreground h-4 w-4" />
    }
  }

  const getStateBadge = () => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium"
    switch (state) {
      case "input-streaming": return <span className={cn(baseClasses, "bg-[#4682f6]/10 text-[#4682f6]")}>执行中</span>
      case "input-available": return <span className={cn(baseClasses, "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400")}>准备就绪</span>
      case "output-available": return <span className={cn(baseClasses, "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400")}>已完成</span>
      case "output-error": return <span className={cn(baseClasses, "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>执行失败</span>
      default: return <span className={cn(baseClasses, "bg-muted text-muted-foreground")}>等待中</span>
    }
  }

  const formatValue = (value: unknown): string => {
    if (value === null) return "null"
    if (value === undefined) return "undefined"
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
          <button
            type="button"
            aria-label={isOpen ? `收起${toolPart.type}` : `展开${toolPart.type}`}
            onClick={(event) => {
              event.preventDefault()
              toggleOpen()
            }}
            className={cn(buttonVariants({ variant: "ghost" }), "bg-background h-auto w-full justify-between rounded-b-none px-3 py-2 font-normal")}
          >
            <div className="flex min-w-0 items-center gap-2">
              {getStateIcon()}
              <span className="truncate font-mono text-sm font-medium">{toolPart.type}</span>
              {getStateBadge()}
            </div>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
          </button>
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
              <h4 className="mb-2 text-sm font-medium text-red-500">错误信息</h4>
              <div className="bg-background rounded border border-red-200 p-2 text-sm dark:border-red-950 dark:bg-red-900/20">{toolPart.errorText}</div>
            </div>}
            {state === "input-streaming" && <div className="text-muted-foreground text-sm">正在调用工具能力…</div>}
            {toolCallId && <div className="text-muted-foreground border-t border-[#4682f6]/20 pt-2 text-xs"><span className="font-mono">调用标识：{toolCallId}</span></div>}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export { Tool }
