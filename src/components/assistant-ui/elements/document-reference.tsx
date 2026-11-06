"use client";

import { FileKindIcon, fileKind } from "./file-kind";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export interface DocumentAnchor {
  page: number;
  quote: string;
}

export function DocumentReference({
  title,
  pages,
  anchors,
  activePage,
  onJump,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "title" | "pages" | "anchors" | "activePage" | "onJump"
> & {
  title: string;
  pages?: number;
  anchors: readonly DocumentAnchor[];
  activePage: number;
  onJump?: (page: number) => void;
}) {
  // several anchors can cite one page, and only one of them is the current item
  const currentIndex = anchors.findIndex(
    (anchor) => anchor.page === activePage,
  );

  return (
    <div
      data-slot="document-reference"
      className={cn(
        "lx-card flex w-full max-w-[440px] flex-col gap-3 p-3.5",
        className,
      )}

      {...props}
    >
      <div className="flex items-center gap-2.5">
        <FileKindIcon kind={fileKind('', title)} size={28} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] font-medium">{title}</span>
          <span className="text-[11.5px] text-muted-foreground">
            {[pages ? `${pages} 页` : '', anchors.length ? `${anchors.length} 处引用` : '文档来源'].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {anchors.map((anchor, i) => (
          <button
            key={`${anchor.page}-${i}`}
            type="button"
            disabled={!onJump}
            aria-current={i === currentIndex || undefined}
            onClick={() => onJump?.(anchor.page)}
            className={cn(
              "flex flex-col gap-1 rounded-xl px-2.5 py-2 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default motion-reduce:transition-none",
              anchor.page === activePage
                ? "bg-formula"
                : "hover:bg-formula",
            )}
          >
            <span className="text-[11.5px] text-muted-foreground">
              第 {anchor.page} 页
            </span>
            <span className="font-serif text-[13px] leading-[1.7] text-fg2 break-words">
              {anchor.quote}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
