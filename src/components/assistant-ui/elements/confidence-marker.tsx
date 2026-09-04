"use client";

import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { conversationCardSize, floating, mono } from "./surfaces";

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

const LABEL: Record<Confidence, string> = {
  grounded: "来自文献",
  inferred: "推断",
  uncertain: "未验证",
};

export function ConfidenceMarkerInline({
  claim,
  children = claim.text,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  claim: ConfidenceClaim;
  children?: ReactNode;
}) {
  const basisId = useId();
  return (
    <span className="group/confidence relative inline">
      <button
        type="button"
        aria-describedby={basisId}
        aria-label={`${claim.text}，${LABEL[claim.confidence]}：${claim.basis}`}
        className={cn(
          "focus-visible:ring-foreground/20 inline cursor-help rounded text-start underline decoration-2 underline-offset-[3px] transition-colors outline-none focus-visible:ring-1",
          UNDERLINE[claim.confidence],
          "text-foreground/70 hover:text-foreground/95 focus:text-foreground/95",
        )}
        {...props}
      >
        {children}
      </button>
      <span
        id={basisId}
        role="status"
        className={cn(
          floating,
          mono,
          "pointer-events-none invisible absolute bottom-full start-0 z-30 mb-2 flex w-max max-w-72 items-center gap-1.5 rounded-full px-2.5 py-1.5 opacity-0 transition-opacity group-focus-within/confidence:visible group-focus-within/confidence:opacity-100 group-hover/confidence:visible group-hover/confidence:opacity-100",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            claim.confidence === "grounded" && "bg-primary",
            claim.confidence === "inferred" && "bg-chart-1",
            claim.confidence === "uncertain" && "bg-destructive",
          )}
        />
        {LABEL[claim.confidence]} · {claim.basis}
      </span>
    </span>
  );
}

export function ConfidenceMarker({
  claims,
  hoveredId,
  onHover,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "claims" | "hoveredId" | "onHover"
> & {
  claims: readonly ConfidenceClaim[];
  hoveredId: string;
  onHover?: (id: string) => void;
}) {
  const basisId = useId();
  const hovered = claims.find((claim) => claim.id === hoveredId);

  return (
    <div
      data-slot="confidence-marker"
      className={cn(conversationCardSize.standard, "flex flex-col gap-2.5", className)}

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
                hovered.confidence === "grounded" && "bg-primary",
                hovered.confidence === "inferred" && "bg-chart-1",
                hovered.confidence === "uncertain" && "bg-destructive",
              )}
            />
            {LABEL[hovered.confidence]} · {hovered.basis}
          </span>
        )}
      </div>
    </div>
  );
}
