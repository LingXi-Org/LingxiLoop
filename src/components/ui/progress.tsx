"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

type ProgressContextValue = {
  value: number
  max: number
}

const ProgressContext = React.createContext<ProgressContextValue>({ value: 0, max: 100 })

function Progress({
  className,
  children,
  value = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const normalizedMax = Number.isFinite(max) && max > 0 ? max : 100
  const normalizedValue = Math.min(Math.max(Number(value) || 0, 0), normalizedMax)
  const percentage = normalizedValue / normalizedMax * 100

  return (
    <ProgressContext.Provider value={{ value: normalizedValue, max: normalizedMax }}>
      <ProgressPrimitive.Root
        value={normalizedValue}
        max={normalizedMax}
        data-slot="progress"
        className={cn("flex flex-wrap gap-3", className)}
        {...props}
      >
        {children}
        <ProgressTrack>
          <ProgressIndicator style={{ transform: `translateX(-${100 - percentage}%)` }} />
        </ProgressTrack>
      </ProgressPrimitive.Root>
    </ProgressContext.Provider>
  )
}

function ProgressTrack({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative flex h-3 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      data-slot="progress-track"
      {...props}
    />
  )
}

function ProgressIndicator({
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Indicator>) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn("h-full w-full flex-1 bg-primary transition-all", className)}
      {...props}
    />
  )
}

function ProgressLabel({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("text-sm font-medium", className)}
      data-slot="progress-label"
      {...props}
    />
  )
}

function ProgressValue({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  children?: React.ReactNode | ((formattedValue: string, value: number) => React.ReactNode)
}) {
  const { value, max } = React.useContext(ProgressContext)
  const formattedValue = `${Math.round(value / max * 100)}%`

  return (
    <span
      className={cn("ml-auto text-sm text-muted-foreground tabular-nums", className)}
      data-slot="progress-value"
      {...props}
    >
      {typeof children === "function" ? children(formattedValue, value) : children ?? formattedValue}
    </span>
  )
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
}
