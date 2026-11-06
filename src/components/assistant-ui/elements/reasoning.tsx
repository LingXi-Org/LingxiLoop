"use client";

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useIsomorphicLayoutEffect } from "../utils/useIsomorphicLayoutEffect";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollLock } from '@assistant-ui/react';
import {
  CollapsibleRoot as Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible-root";

export const ANIMATION_DURATION = 200;

const ReasoningPreviewContext = createContext(false);

const reasoningVariants = cva("aui-reasoning-root mb-4 w-full", {
  variants: {
    variant: {
      outline: "rounded-lg border px-3 py-2",
      ghost: "",
      muted: "bg-muted/50 rounded-lg px-3 py-2",
    },
  },
  defaultVariants: {
    variant: "outline",
  },
});

export type ReasoningRootProps = Omit<
  React.ComponentProps<typeof Collapsible>,
  "open" | "onOpenChange"
> &
  VariantProps<typeof reasoningVariants> & {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    defaultOpen?: boolean;
    /**
     * Whether the reasoning is currently streaming. While `true` the
     * disclosure is held open with a bottom-pinned live preview; when
     * streaming ends it returns to `defaultOpen`, and the first manual
     * toggle takes over the open/close state permanently. The live preview
     * keeps following the newest tokens while the disclosure is open during
     * streaming, even after a manual toggle, and pauses while the reader is
     * scrolled up.
     */
    streaming?: boolean;
    /** Called right before the disclosure animates, on toggle and on streaming transitions. */
    onAnimationStart?: () => void;
  };

const ReasoningRoot = forwardRef<
  HTMLDivElement,
  Omit<ReasoningRootProps, "ref">
>(function ReasoningRoot(
  {
    className,
    variant,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    defaultOpen = false,
    streaming,
    onAnimationStart,
    children,
    ...props
  },
  ref,
) {
  const [initialOpen] = useState(defaultOpen);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled
    ? controlledOpen
    : (userOpen ?? (streaming || initialOpen));
  const isPreview = streaming === true && isOpen;

  const prevStreamingRef = useRef(streaming);
  useIsomorphicLayoutEffect(() => {
    if (prevStreamingRef.current === streaming) return;
    prevStreamingRef.current = streaming;
    // A streaming transition only animates the panel when the resting state
    // is collapsed; with `defaultOpen` the disclosure stays open across it.
    if (!isControlled && userOpen === null && !initialOpen) {
      onAnimationStart?.();
    }
  }, [streaming, isControlled, userOpen, initialOpen, onAnimationStart]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      onAnimationStart?.();
      if (!isControlled) {
        setUserOpen(open);
      }
      controlledOnOpenChange?.(open);
    },
    [onAnimationStart, isControlled, controlledOnOpenChange],
  );

  return (
    <Collapsible
      ref={ref}
      data-slot="reasoning-root"
      data-variant={variant}
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(
        "group/reasoning-root",
        reasoningVariants({ variant, className }),
      )}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as React.CSSProperties
      }
      {...props}
    >
      <ReasoningPreviewContext.Provider value={isPreview}>
        {children}
      </ReasoningPreviewContext.Provider>
    </Collapsible>
  );
});

function ReasoningFade({
  side = "bottom",
  className,
  ...props
}: React.ComponentProps<"div"> & { side?: "top" | "bottom" }) {
  if (side === "top") {
    return (
      <div
        data-slot="reasoning-fade"
        className={cn(
          "aui-reasoning-fade pointer-events-none absolute inset-x-0 top-0 z-10 h-8",
          "bg-[linear-gradient(to_bottom,var(--color-background),transparent)]",
          "group-data-[variant=muted]/reasoning-root:bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--color-muted)_50%,var(--color-background)),transparent)]",
          "fade-in-0 animate-in",
          "animation-duration-(--animation-duration)",
          className,
        )}
        {...props}
      />
    );
  }

  return (
    <div
      data-slot="reasoning-fade"
      className={cn(
        "aui-reasoning-fade pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8",
        "bg-[linear-gradient(to_top,var(--color-background),transparent)]",
        "group-data-[variant=muted]/reasoning-root:bg-[linear-gradient(to_top,color-mix(in_oklab,var(--color-muted)_50%,var(--color-background)),transparent)]",
        "fade-in-0 animate-in",
        "animation-duration-(--animation-duration)",
        className,
      )}
      {...props}
    />
  );
}

function ReasoningTrigger({
  active,
  duration,
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  active?: boolean;
  duration?: number | undefined;
}) {
  const label = active ? "正在思考" : duration ? `已思考 ${duration} 秒` : "公开说明";

  return (
    <CollapsibleTrigger
      data-slot="reasoning-trigger"
      className={cn(
        "aui-reasoning-trigger group/trigger flex h-7 w-fit max-w-[75%] items-center gap-1.5 rounded-full bg-[rgb(183_121_31/8%)] ps-1 pe-2.5 text-[12.5px] text-fg2 outline-none hover:bg-[rgb(183_121_31/13%)] focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-md bg-[rgb(183_121_31/12%)] text-[#B7791F]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" /></svg>
      </span>
      <span
        data-slot="reasoning-trigger-label"
        className={cn("aui-reasoning-trigger-label-wrapper inline-block leading-none tabular-nums", active && "shimmer motion-reduce:animate-none")}
      >
        {label}
      </span>
      <ChevronRightIcon
        data-slot="reasoning-trigger-chevron"
        aria-hidden="true"
        strokeWidth={2}
        className="aui-reasoning-trigger-chevron size-3 shrink-0 text-muted-foreground transition-transform duration-150 group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none"
      />
    </CollapsibleTrigger>
  );
}

function ReasoningContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  const isPreview = useContext(ReasoningPreviewContext);

  return (
    <CollapsibleContent
      data-slot="reasoning-content"
      className={cn(
        "aui-reasoning-content relative overflow-hidden text-sm outline-none",
        "group/collapsible-content ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none",
        "data-closed:animate-collapsible-up",
        "data-open:animate-collapsible-down",
        "data-closed:fill-mode-forwards",
        "data-closed:pointer-events-none",
        "[--tw-duration:var(--animation-duration)]",
        className,
      )}
      {...props}
    >
      {children}
      {isPreview ? <ReasoningFade /> : null}
    </CollapsibleContent>
  );
}

function ReasoningText({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const isPreview = useContext(ReasoningPreviewContext);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState(true);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const content = contentRef.current;
    if (isPreview || !content) return;
    const measure = () => setOverflowing(content.scrollHeight > 112);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [isPreview]);

  useEffect(() => {
    if (!isPreview) return;
    const scrollEl = scrollRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl) return;

    let pinned = true;
    let lastScrollTop = scrollEl.scrollTop;
    let lastScrollHeight = scrollEl.scrollHeight;
    const isAtBottom = () =>
      Math.abs(
        scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight,
      ) <= 1 || scrollEl.scrollHeight <= scrollEl.clientHeight;

    const pin = () => {
      if (!pinned) return;
      scrollEl.scrollTop = scrollEl.scrollHeight;
    };
    // A pin's own scroll event can arrive after new content grew the scroll
    // height and read as "not at bottom"; only an upward move at unchanged
    // scroll height is user intent.
    const onScroll = () => {
      if (isAtBottom()) {
        pinned = true;
      } else if (
        scrollEl.scrollTop < lastScrollTop &&
        scrollEl.scrollHeight === lastScrollHeight
      ) {
        pinned = false;
      }
      lastScrollTop = scrollEl.scrollTop;
      lastScrollHeight = scrollEl.scrollHeight;
    };

    pin();
    scrollEl.addEventListener("scroll", onScroll);
    const observer = new ResizeObserver(pin);
    observer.observe(contentEl);
    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [isPreview]);

  return (
    <>
    <div
      ref={scrollRef}
      data-slot="reasoning-text"
      className={cn(
        "aui-reasoning-text relative z-0 ms-[9px] mt-2 border-s border-[rgb(183_121_31/35%)] py-0.5 ps-[21px] text-[13.5px] leading-[1.75] text-fg2 text-pretty",
        isPreview ? "max-h-64 overflow-y-auto" : folded ? "max-h-[104px] overflow-hidden" : "",
        "transform-gpu transition-[transform,opacity] ease-[cubic-bezier(0.32,0.72,0,1)]",
        "motion-reduce:animate-none",
        "group-data-open/collapsible-content:animate-in",
        "group-data-closed/collapsible-content:animate-out",
        "group-data-open/collapsible-content:fade-in-0",
        "group-data-closed/collapsible-content:fade-out-0",
        "group-data-open/collapsible-content:slide-in-from-top-4",
        "group-data-closed/collapsible-content:slide-out-to-top-4",
        "group-data-open/collapsible-content:blur-in-[2px]",
        "group-data-closed/collapsible-content:blur-out-[2px]",
        "group-data-open/collapsible-content:animation-duration-(--animation-duration)",
        "group-data-closed/collapsible-content:animation-duration-(--animation-duration)",
        className,
      )}
      {...props}
    >
      <div ref={contentRef} className="aui-reasoning-text-content flex flex-col gap-2.5">
        {children}
      </div>
      {!isPreview && folded && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-11 bg-[linear-gradient(transparent,var(--background))]" />}
    </div>
    {!isPreview && overflowing && <button type="button" onClick={() => setFolded(value => !value)}
      className="ms-[30px] mt-1 h-6 text-[12.5px] font-medium text-[#B7791F] hover:underline focus-visible:outline-2 focus-visible:outline-ring dark:text-[#E5B565]">
      {folded ? '展开全部' : '收起'}
    </button>}
    </>
  );
}

export {
  ReasoningRoot,
  ReasoningTrigger,
  ReasoningContent,
  ReasoningText,
  ReasoningFade,
  reasoningVariants,
};

export function Reasoning({ streaming, children, defaultOpen }: { streaming: boolean; defaultOpen?: boolean; summary?: string; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const lockScroll = useScrollLock(root, ANIMATION_DURATION);
  return <ReasoningRoot ref={root} defaultOpen={defaultOpen} streaming={streaming} onAnimationStart={lockScroll}>
    <ReasoningTrigger active={streaming} />
    <ReasoningContent><ReasoningText>{children}</ReasoningText></ReasoningContent>
  </ReasoningRoot>;
}
