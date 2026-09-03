"use client"

import { CheckIcon, PlugIcon, XIcon } from "lucide-react"
import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"
import { conversationCardSize, field, inkButton, mono, paper } from "./surfaces"

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
  return (
    <div
      data-slot="elicitation-form"
      className={cn(
        paper,
        conversationCardSize.standard,
        "flex flex-col gap-3.5 rounded-[20px] p-4",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2.5">
        <span className="bg-foreground/[0.05] text-foreground/45 flex size-7 shrink-0 items-center justify-center rounded-lg">
          <PlugIcon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{server}</span>
        <span className={cn(mono, "text-foreground/30 shrink-0")}>需要补充信息</span>
      </div>

      <p className="text-foreground/55 text-xs leading-relaxed">{message}</p>

      <div className="flex flex-col gap-2.5">
        {fields.map((item) => {
          const selected = Array.isArray(item.value) ? item.value : [item.value]
          return (
            <div key={item.name} className="flex flex-col gap-1">
              <span className={cn(mono, "text-foreground/35")}>
                {item.label}
                {item.required && <span className="text-foreground/25"> *</span>}
              </span>
              {item.kind === "choice" ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {item.options?.map((option) => {
                      const active = selected.includes(option.value)
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={active}
                          disabled={state !== "request" || option.disabled}
                          onClick={() => {
                            const value = item.multiple
                              ? active ? selected.filter((entry) => entry !== option.value) : [...selected, option.value]
                              : option.value
                            onFieldChange?.(item.name, value)
                          }}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs transition-colors disabled:cursor-default",
                            active ? "bg-primary text-primary-foreground" : cn(field, "text-muted-foreground"),
                          )}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                  {item.inputLabel && (
                    <input
                      aria-label={item.inputLabel}
                      className={cn(field, "text-foreground/80 rounded-lg px-2.5 py-1.5 text-xs")}
                      value={selected.filter((entry) => !item.options?.some((option) => option.value === entry)).join('、')}
                      placeholder={item.placeholder}
                      disabled={state !== "request"}
                      onChange={(event) => {
                        const choices = selected.filter((entry) => item.options?.some((option) => option.value === entry))
                        onFieldChange?.(item.name, item.multiple
                          ? [...choices, ...(event.target.value ? [event.target.value] : [])]
                          : event.target.value)
                      }}
                    />
                  )}
                </>
              ) : item.kind === "toggle" ? (
                <button
                  type="button"
                  disabled={state !== "request"}
                  onClick={() => onFieldChange?.(item.name, item.value === "true" ? "false" : "true")}
                  className="flex w-fit items-center gap-2"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-4 w-7 items-center rounded-full p-0.5 transition-colors duration-200",
                      item.value === "true" ? "bg-primary" : "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "bg-primary-foreground size-3 rounded-full transition-transform duration-200 motion-reduce:transition-none",
                        item.value === "true" && "translate-x-3",
                      )}
                    />
                  </span>
                  <span className="text-foreground/55 text-xs">{item.value === "true" ? "已开启" : "已关闭"}</span>
                </button>
              ) : (
                <input
                  className={cn(field, "text-foreground/80 rounded-lg px-2.5 py-1.5 text-xs")}
                  value={typeof item.value === "string" ? item.value : ""}
                  placeholder={item.placeholder}
                  disabled={state !== "request"}
                  onChange={(event) => onFieldChange?.(item.name, event.target.value)}
                />
              )}
            </div>
          )
        })}
      </div>

      <div className="flex h-8 items-center justify-end gap-2">
        {state === "request" ? (
          <>
            {onDecline && (
              <button
                type="button"
                onClick={onDecline}
                className="text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground/90 h-8 rounded-full px-3.5 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96]"
              >
                拒绝
              </button>
            )}
            <button
              type="button"
              onClick={onAccept}
              disabled={acceptDisabled}
              className={cn(inkButton, "flex h-8 items-center rounded-full px-3.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40")}
            >
              {acceptLabel}
            </button>
          </>
        ) : (
          <span className="fade-in animate-in text-foreground/55 flex items-center gap-2 text-xs duration-300">
            {state === "accepted" ? (
              <><CheckIcon className="size-3.5 text-primary" />{acceptedLabel}</>
            ) : (
              <><XIcon className="text-foreground/45 size-3.5" />已拒绝</>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
