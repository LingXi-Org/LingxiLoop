"use client";

import type { ComponentProps, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { floating, mono } from "./surfaces";

export type Confidence = "grounded" | "inferred" | "uncertain";

export interface ConfidenceClaim {
  id: string;
  text: string;
  confidence: Confidence;
  basis: string;
}

const UNDERLINE: Record<Confidence, string> = {
  grounded: "decoration-emerald-500/50",
  inferred: "decoration-amber-500/60",
  uncertain: "decoration-red-500/50 decoration-dotted",
};

const HIGHLIGHT: Record<Confidence, string> = {
  grounded: "bg-emerald-500/10 hover:bg-emerald-500/15",
  inferred: "bg-amber-500/10 hover:bg-amber-500/15",
  uncertain: "bg-red-500/10 hover:bg-red-500/15",
};

const LABEL: Record<Confidence, string> = {
  grounded: "from a source",
  inferred: "inferred",
  uncertain: "unverified",
};

export function ConfidenceMarker({
  claims,
  hoveredId,
  onHover,
  onActivate,
  variant = "block",
  children,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "claims" | "hoveredId" | "onHover" | "onActivate"
> & {
  claims: readonly ConfidenceClaim[];
  hoveredId: string;
  onHover?: (id: string) => void;
  onActivate?: (claim: ConfidenceClaim) => void;
  variant?: "block" | "inline";
  children?: ReactNode;
}) {
  const basisId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovered = claims.find((claim) => claim.id === hoveredId);
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  if (variant === "inline") {
    const claim = claims[0];
    if (!claim) return <>{children}</>;
    const show = () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      onHover?.(claim.id);
    };
    const hide = () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => onHover?.(""), 100);
    };
    return (
      <Popover open={Boolean(hovered)} onOpenChange={(open) => { if (!open) onHover?.(""); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-slot="confidence-marker"
            aria-describedby={hovered ? basisId : undefined}
            onClick={() => { onHover?.(""); onActivate?.(claim); }}
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
            className={cn(
              "focus-visible:ring-ring inline cursor-pointer rounded-sm px-0.5 text-start underline decoration-2 underline-offset-[3px] outline-none transition-colors focus-visible:ring-2",
              UNDERLINE[claim.confidence],
              HIGHLIGHT[claim.confidence],
              className,
            )}
          >
            {children ?? claim.text}
          </button>
        </PopoverTrigger>
        {hovered && <PopoverContent
            id={basisId}
            role="status"
            side="top"
            align="start"
            onMouseEnter={show}
            onMouseLeave={hide}
            onOpenAutoFocus={(event) => event.preventDefault()}
            className={cn(
              mono,
              "max-h-[min(24rem,70vh)] w-80 gap-2 overflow-y-auto rounded-2xl p-3 text-xs leading-5",
            )}
          >
            <span className="font-medium text-foreground">来源证据</span>
            <span className="whitespace-pre-wrap break-words text-muted-foreground">{claim.basis}</span>
          </PopoverContent>}
      </Popover>
    );
  }

  return (
    <div
      data-slot="confidence-marker"
      className={cn("flex w-full max-w-sm flex-col gap-2.5", className)}

      {...props}
    >
      <p className="text-[13.5px] leading-relaxed">
        {claims.map((claim) => (
          <button
            key={claim.id}
            type="button"
            aria-describedby={hoveredId === claim.id ? basisId : undefined}
            onMouseEnter={() => onHover?.(claim.id)}
            onMouseLeave={() => onHover?.("")}
            onFocus={() => onHover?.(claim.id)}
            onBlur={() => onHover?.("")}
            className={cn(
              "focus-visible:ring-foreground/20 inline cursor-help rounded text-start underline decoration-2 underline-offset-[3px] transition-colors outline-none focus-visible:ring-1",
              UNDERLINE[claim.confidence],
              hoveredId === claim.id
                ? "text-foreground/95"
                : "text-foreground/70",
            )}
          >
            {claim.text}{" "}
          </button>
        ))}
      </p>

      <div className="flex h-9 items-start">
        {hovered && (
          <span
            id={basisId}
            role="status"
            className={cn(
              floating,
              mono,
              "fade-in zoom-in-95 animate-in text-foreground/55 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 duration-150",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                hovered.confidence === "grounded" && "bg-emerald-500",
                hovered.confidence === "inferred" && "bg-amber-500",
                hovered.confidence === "uncertain" && "bg-red-500",
              )}
            />
            {LABEL[hovered.confidence]} · {hovered.basis}
          </span>
        )}
      </div>
    </div>
  );
}
