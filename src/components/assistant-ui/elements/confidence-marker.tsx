"use client";

import { createContext, useContext, useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { floating, mono } from "./surfaces";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type Confidence = "grounded" | "inferred" | "uncertain";

export interface ConfidenceClaim {
  id: string;
  text: string;
  confidence: Confidence;
  basis: string;
  evidence?: readonly {
    marker: string;
    chunkId: string;
    title: string;
    excerpt: string;
    truncated?: boolean;
  }[];
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
  const basis = hovered && (hovered.evidence?.length ? <div className="space-y-3">
    {hovered.evidence.map((item) => <section key={`${item.marker}:${item.chunkId}`} className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground">{item.marker}</span>
        <span className="min-w-0 font-medium">{item.title}</span>
        {item.truncated && <span className="shrink-0 text-muted-foreground">节选</span>}
      </div>
      <div className="space-y-2 text-[13px] leading-relaxed [&_p]:my-2 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5 [&_blockquote]:border-s-2 [&_blockquote]:border-border [&_blockquote]:ps-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre_code]:p-0 [&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_a]:underline [&_a]:underline-offset-2 [&_a]:focus-visible:outline [&_a]:focus-visible:outline-ring [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold">
        <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
          table: ({ children }) => <div className="max-w-full overflow-x-auto"><table className="w-full text-start">{children}</table></div>,
          img: ({ alt }) => <span className="text-muted-foreground">{alt}</span>,
        }}>{item.excerpt}</ReactMarkdown>
      </div>
    </section>)}
  </div> : <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
    {LABEL[hovered.confidence]} · {hovered.basis}
  </span>);
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
            className="w-96 max-w-[calc(100vw-24px)] max-h-[min(20rem,var(--radix-popover-content-available-height))] overflow-auto rounded-xl p-3 text-sm leading-5 shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
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
            {hovered && <div className={cn(floating, mono,
              "text-foreground/70 inline-flex max-w-full items-start gap-1.5 rounded-2xl px-2.5 py-1.5",
            )}>
              <span aria-hidden className={cn("mt-1 size-1.5 shrink-0 rounded-full",
                hovered.confidence === "grounded" && "bg-emerald-500",
                hovered.confidence === "inferred" && "bg-amber-500",
                hovered.confidence === "uncertain" && "bg-red-500",
              )} />
              <div className="min-w-0">{basis}</div>
            </div>}
          </div>
        </div>}
      </div>
    </ConfidenceContext.Provider>
  );
}
