"use client";

import { createContext, useContext, useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
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
  hoveredId: "", basisId: "", leave: () => {},
  show: (_id: string, _element: HTMLElement, _point?: { x: number; y: number }) => {},
  focusBasis: () => {},
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
  const { hoveredId, basisId, show, leave, focusBasis } = useContext(ConfidenceContext);
  return (
    <button
      type="button"
      data-confidence-id={claim.id}
      aria-describedby={hoveredId === claim.id ? basisId : undefined}
      onPointerEnter={(event) => { if (event.pointerType !== "touch") show(claim.id, event.currentTarget, { x: event.clientX, y: event.clientY }); }}
      onPointerLeave={(event) => { if (event.pointerType !== "touch") leave(); }}
      onFocus={(event) => show(claim.id, event.currentTarget)}
      onClick={(event) => show(claim.id, event.currentTarget)}
      onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); focusBasis(); } }}
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
  floatingBasis = false,
  className,
  ...props
}: Omit<ComponentProps<"div">, "onSelect"> & {
  claims: readonly ConfidenceClaim[];
  hoveredId: string;
  onHover: (id: string) => void;
  floatingBasis?: boolean;
}) {
  const basisId = useId();
  const hovered = claims.find((claim) => claim.id === hoveredId);
  const root = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const location = useRef<{ element: HTMLElement; x?: number; y?: number } | null>(null);
  const anchor = useRef({ getBoundingClientRect: () => {
    const position = location.current, rect = position?.element.getBoundingClientRect();
    return rect && position?.x !== undefined && position.y !== undefined
      ? new DOMRect(rect.left + position.x, rect.top + position.y, 0, 0) : rect ?? new DOMRect();
  } });
  const cancelClose = () => clearTimeout(closeTimer.current);
  const leave = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (!panel.current?.contains(document.activeElement)) restoreFocusedClaim(root.current, onHover);
    }, floatingBasis ? 150 : 0);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const basis = hovered && <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
    {LABEL[hovered.confidence]} · {hovered.basis}
  </span>;
  return (
    <ConfidenceContext.Provider value={{ hoveredId, basisId, leave, show: (id, element, point) => {
      cancelClose();
      if (id !== hoveredId || location.current?.element !== element) {
        const rect = element.getBoundingClientRect();
        location.current = { element, ...(point ? { x: point.x - rect.left, y: point.y - rect.top } : {}) };
      }
      onHover(id);
    }, focusBasis: () => panel.current?.focus() }}>
      <div
        {...props}
        ref={root}
        data-slot="confidence-marker"
        className={cn("flex min-w-0 max-w-full flex-col gap-2.5", className)}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") leave();
        }}
        onPointerEnter={cancelClose}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Element && panel.current?.contains(next)) return;
          if (!(next instanceof Element) || !event.currentTarget.contains(next)
            || !next.closest('[data-confidence-id], [data-slot="confidence-basis"]')) onHover("");
        }}
        onKeyDown={(event) => { if (event.key === "Escape") onHover(""); }}
      >
        {children ?? <p className="text-[13.5px] leading-relaxed">
          {claims.map((claim) => <ConfidenceMarkerInline key={claim.id} claim={claim}>{claim.text}{" "}</ConfidenceMarkerInline>)}
        </p>}
        {floatingBasis ? <Popover open={Boolean(hovered)} onOpenChange={(open) => { if (!open) onHover(""); }}>
          <PopoverAnchor virtualRef={anchor} />
          <PopoverContent ref={panel} data-slot="confidence-basis" aria-label="引用依据" tabIndex={0}
            side="bottom" align="start" sideOffset={12} collisionPadding={12} updatePositionStrategy="always"
            className="w-96 max-w-[calc(100vw-24px)] max-h-[min(16rem,var(--radix-popover-content-available-height))] overflow-auto rounded-xl p-3 text-sm leading-5 motion-reduce:animate-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}
            onEscapeKeyDown={() => {
              if (panel.current?.contains(document.activeElement)) location.current?.element.focus();
              onHover("");
            }}
            onInteractOutside={(event) => {
              const target = event.detail.originalEvent.target;
              if (target instanceof Element && root.current?.contains(target) && target.closest('[data-confidence-id]')) event.preventDefault();
            }}
            onPointerEnter={cancelClose} onPointerLeave={leave}>
            <div id={basisId} role="status" aria-live="polite">{basis}</div>
          </PopoverContent>
        </Popover> : claims.length > 0 && <div
          data-slot="confidence-basis"
          ref={panel}
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
              <span className="min-w-0">{basis}</span>
            </span>}
          </div>
        </div>}
      </div>
    </ConfidenceContext.Provider>
  );
}
