"use client"
import { MessageFooterContents } from '../message-footer'
import { ActionTicket, ticketGhost, ticketPrimary } from './approval-card'

import { CheckIcon, XIcon } from "lucide-react"
import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

export type ElicitationState = "request" | "accepted" | "declined"
export type ElicitationValue = string | readonly string[]

export interface ElicitationChoice {
  value: string
  label: string
  disabled?: boolean
}

export interface ElicitationField {
  name: string
  label: string
  value: ElicitationValue
  kind: "text" | "choice" | "toggle"
  options?: readonly ElicitationChoice[]
  inputLabel?: string
  placeholder?: string
  required?: boolean
  multiple?: boolean
}

export function ElicitationForm({
  server,
  message,
  fields,
  state,
  onFieldChange,
  onAccept,
  onDecline,
  acceptDisabled = false,
  acceptLabel = "提交",
  acceptedLabel = "已提交",
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "server"
  | "message"
  | "fields"
  | "state"
  | "onFieldChange"
  | "onAccept"
  | "onDecline"
  | "acceptDisabled"
> & {
  server: string
  message: string
  fields: readonly ElicitationField[]
  state: ElicitationState
  onFieldChange?: (name: string, value: ElicitationValue) => void
  onAccept?: () => void
  onDecline?: () => void
  acceptDisabled?: boolean
  acceptLabel?: string
  acceptedLabel?: string
}) {
  const choiceCount = (item: ElicitationField) => item.options?.length ?? 0
  const formIcon = <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><path d="M9 11h6M9 15h4" /><rect x="4" y="3" width="16" height="18" rx="2" /></svg>
  const inputClass = "h-9 w-full rounded-[10px] border border-input bg-background px-3 text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-brand disabled:opacity-60"
  return (
    <div data-slot="elicitation-form" className={cn("w-full max-w-[640px]", className)} {...props}>
      <MessageFooterContents>
      <ActionTicket
        kind={<>{formIcon}{server}</>}
        status={state === "request" ? <span className="text-xs text-muted-foreground">需要补充信息</span> : undefined}
        title={message}
        footer={state === "request" ? <>
          <span className="flex-1" />
          {onDecline && <button type="button" onClick={onDecline} className={ticketGhost}>跳过</button>}
          <button type="button" onClick={onAccept} disabled={acceptDisabled} className={ticketPrimary}>{acceptLabel}</button>
        </> : <span role="status" className="fade-in animate-in flex items-center gap-2 text-xs text-muted-foreground duration-300">
          {state === "accepted" ? <><CheckIcon className="size-3.5 text-brand" />{acceptedLabel}</> : <><XIcon className="size-3.5" />已跳过</>}
        </span>}>
        <div className="flex flex-col gap-3">
          {fields.map((item) => {
            const selected = Array.isArray(item.value) ? item.value : [item.value]
            const segmented = item.kind === "choice" && !item.multiple && choiceCount(item) <= 4
            return (
              <div key={item.name} className="flex flex-col gap-1.5">
                {fields.length > 1 && <span className="text-xs text-muted-foreground">{item.label}{item.required && <span aria-hidden> *</span>}</span>}
                {item.kind === "choice" ? (
                  <>
                    <div role="group" aria-label={item.label} className={segmented ? "flex gap-0.5 rounded-[10px] bg-accent p-[3px]" : "flex flex-wrap gap-1.5"}>
                      {item.options?.map((option) => {
                        const active = selected.includes(option.value)
                        return (
                          <button key={option.value} type="button" aria-pressed={active}
                            disabled={state !== "request" || option.disabled}
                            onClick={() => {
                              const value = item.multiple
                                ? active ? selected.filter((entry) => entry !== option.value) : [...selected, option.value]
                                : option.value
                              onFieldChange?.(item.name, value)
                            }}
                            className={cn("inline-flex h-[30px] items-center justify-center rounded-lg px-3.5 text-[13px] transition-colors disabled:cursor-default",
                              segmented ? "flex-1" : "border border-border",
                              active ? segmented ? "bg-card text-foreground shadow-[0_1px_2px_rgb(20_20_18/10%),0_0_0_1px_var(--border)]" : "border-brand bg-brand-surface text-brand" : "text-muted-foreground hover:text-foreground")}>
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                    {item.inputLabel && (
                      <input aria-label={item.inputLabel} className={inputClass}
                        value={selected.filter((entry) => !item.options?.some((option) => option.value === entry)).join('、')}
                        placeholder={item.placeholder ?? "或者用一句话描述…"} disabled={state !== "request"}
                        onChange={(event) => {
                          const choices = selected.filter((entry) => item.options?.some((option) => option.value === entry))
                          onFieldChange?.(item.name, item.multiple
                            ? [...choices, ...(event.target.value ? [event.target.value] : [])]
                            : event.target.value)
                        }} />
                    )}
                  </>
                ) : item.kind === "toggle" ? (
                  <button type="button" role="switch" aria-label={item.label} aria-checked={item.value === 'true'} disabled={state !== "request"}
                    onClick={() => onFieldChange?.(item.name, item.value === "true" ? "false" : "true")}
                    className="flex w-fit items-center gap-2 text-[13px] text-fg2">
                    <span aria-hidden className={cn("relative inline-block h-5 w-[34px] rounded-full transition-colors", item.value === "true" ? "bg-brand" : "bg-input")}>
                      <span className={cn("absolute start-0.5 top-0.5 size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/20%)] transition-transform motion-reduce:transition-none", item.value === "true" && "translate-x-3.5")} />
                    </span>
                    {item.value === "true" ? "已开启" : "已关闭"}
                  </button>
                ) : (
                  <input aria-label={item.inputLabel ?? item.label} required={item.required} className={inputClass}
                    value={typeof item.value === "string" ? item.value : ""} placeholder={item.placeholder}
                    disabled={state !== "request"} onChange={(event) => onFieldChange?.(item.name, event.target.value)} />
                )}
              </div>
            )
          })}
        </div>
      </ActionTicket>
      </MessageFooterContents>
    </div>
  )
}
