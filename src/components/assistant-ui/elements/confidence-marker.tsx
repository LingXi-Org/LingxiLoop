"use client";

import { createContext, useContext, useId, type ComponentProps, type ReactNode } from "react";
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

const LABEL: Record<Confidence, string> = {
  grounded: "已引用来源",
  inferred: "推断",
  uncertain: "未验证",
};

const ConfidenceContext = createContext({
  hoveredId: "", basisId: "", onHover: (_id: string) => {},
});

function restoreFocusedClaim(root: Element | null, onHover: (id: string) => void) {
  const focused = root?.ownerDocument.activeElement;
  if (focused && root?.contains(focused)) {
    if (focused.closest('[data-slot="confidence-basis"]')) return;
    onHover(focused.getAttribute('data-confidence-id') ?? "");
  } else onHover("");
}

export function ConfidenceMarkerInline({
  claim,
  children = claim.text,
}: {
  claim: ConfidenceClaim;
  children?: ReactNode;
}) {
  const { hoveredId, basisId, onHover } = useContext(ConfidenceContext);
  return (
    <button
      type="button"
      data-confidence-id={claim.id}
      aria-describedby={hoveredId === claim.id ? basisId : undefined}
      onPointerEnter={(event) => { if (event.pointerType !== "touch") onHover(claim.id); }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") restoreFocusedClaim(event.currentTarget.closest('[data-slot="confidence-marker"]'), onHover);
      }}
      onFocus={() => onHover(claim.id)}
      onClick={() => onHover(claim.id)}
      className={cn(
        "focus-visible:ring-foreground/20 inline cursor-help rounded text-start underline decoration-2 underline-offset-[3px] transition-colors outline-none focus-visible:ring-2 motion-reduce:transition-none",
        UNDERLINE[claim.confidence],
        hoveredId === claim.id ? "text-foreground/95" : "text-foreground/70",
      )}
    >
      {children}
      <span className="sr-only">，{LABEL[claim.confidence]}</span>
    </button>
  );
}

export function ConfidenceMarker({
  claims,
  hoveredId,
  onHover,
  children,
  className,
  ...props
}: Omit<ComponentProps<"div">, "onSelect"> & {
  claims: readonly ConfidenceClaim[];
  hoveredId: string;
  onHover: (id: string) => void;
}) {
  const basisId = useId();
  const hovered = claims.find((claim) => claim.id === hoveredId);
  return (
    <ConfidenceContext.Provider value={{ hoveredId, basisId, onHover }}>
      <div
        {...props}
        data-slot="confidence-marker"
        className={cn("flex min-w-0 max-w-full flex-col gap-2.5", className)}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") restoreFocusedClaim(event.currentTarget, onHover);
        }}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Element) || !event.currentTarget.contains(next)
            || !next.closest('[data-confidence-id], [data-slot="confidence-basis"]')) onHover("");
        }}
        onKeyDown={(event) => { if (event.key === "Escape") onHover(""); }}
      >
        {children ?? <p className="text-[13.5px] leading-relaxed">
          {claims.map((claim) => <ConfidenceMarkerInline key={claim.id} claim={claim}>{claim.text}{" "}</ConfidenceMarkerInline>)}
        </p>}
        {claims.length > 0 && <div
          data-slot="confidence-basis"
          className="h-9 w-0 min-w-full overflow-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          tabIndex={hovered ? 0 : undefined}
          role="region"
          aria-label="引用依据"
        >
          <div id={basisId} role="status" aria-live="polite">
            {hovered && <span className={cn(floating, mono,
              "text-foreground/70 inline-flex max-w-full items-start gap-1.5 rounded-2xl px-2.5 py-1.5",
            )}>
              <span aria-hidden className={cn("mt-1 size-1.5 shrink-0 rounded-full",
                hovered.confidence === "grounded" && "bg-emerald-500",
                hovered.confidence === "inferred" && "bg-amber-500",
                hovered.confidence === "uncertain" && "bg-red-500",
              )} />
              <span className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{LABEL[hovered.confidence]} · {hovered.basis}</span>
            </span>}
          </div>
        </div>}
      </div>
    </ConfidenceContext.Provider>
  );
}
