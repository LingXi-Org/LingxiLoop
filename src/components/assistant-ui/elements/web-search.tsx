"use client";

import type { ComponentProps } from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolToneIcon } from "./tool-call";
import { take } from "../utils/range";

export interface WebSearchResult {
  title: string;
  domain: string;
  url?: string;
}

const FAVICON_COLORS = ["#B31B1B", "#24292F", "#3B6FD8", "#6B6B66", "#1F8A5B", "#7B5CC9"];

/** A domain's initial on a stable colour — no third-party favicon requests. */
export function DomainMark({ domain, size = 16 }: { domain: string; size?: 16 | 18 }) {
  const host = domain.replace(/^www\./, "");
  let hash = 0;
  for (const character of host) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return <span aria-hidden="true" className="inline-grid shrink-0 place-items-center font-bold text-white"
    style={{ width: size, height: size, borderRadius: size === 16 ? 4 : 5, fontSize: size === 16 ? 9 : 10, background: FAVICON_COLORS[hash % FAVICON_COLORS.length] }}>
    {host.charAt(0).toUpperCase()}
  </span>;
}

export function WebSearch({
  query,
  results,
  visibleResults,
  searching,
  cycle,
  className,
  summaryOnly = false,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "query" | "results" | "visibleResults" | "searching" | "cycle"
> & {
  query: string;
  results: readonly WebSearchResult[];
  visibleResults: number;
  searching: boolean;
  cycle: number;
  /** The caller owns one detailed source list; show only search status here. */
  summaryOnly?: boolean;
}) {
  const chip = <span className="inline-flex h-[30px] w-fit max-w-full items-center gap-2 rounded-full bg-card pe-3 ps-[5px] shadow-[0_0_0_1px_var(--border)]">
    <ToolToneIcon tone="read" />
    <span className="truncate text-[12.5px] text-foreground">{query}</span>
  </span>;
  if (!summaryOnly && !searching && results.length) {
    return <div data-slot="web-search" className={cn("lx-card flex w-full max-w-[620px] flex-col p-1.5", className)} {...props}>
      <div className="flex items-center gap-2 px-2 pb-1.5 pt-2">
        <ToolToneIcon tone="read" />
        <span className="min-w-0 flex-1 truncate text-[12.5px]">{query}</span>
        <span className="text-[11.5px] text-muted-foreground">{results.length} 条</span>
      </div>
      {take(results, visibleResults || results.length).map((result) => (
        <a key={`${cycle}-${result.url ?? result.domain}`} href={result.url} target="_blank" rel="noopener noreferrer"
          className="flex h-[34px] min-w-0 items-center gap-2.5 rounded-lg px-2 hover:bg-formula focus-visible:outline-2 focus-visible:outline-ring">
          <DomainMark domain={result.domain} />
          <span className="min-w-0 flex-1 truncate text-[13px]">{result.title}</span>
          <span className="shrink-0 text-[11.5px] text-muted-foreground">{result.domain.replace(/^www\./, "")}</span>
        </a>
      ))}
    </div>;
  }
  return (
    <div data-slot="web-search" className={cn("flex w-full max-w-[620px] flex-col gap-2", className)} {...props}>
      {chip}
      {searching ? (
        <span role="status" className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span aria-hidden="true" className="inline-flex gap-[3px]">{[0, 1, 2].map(index => <i key={index} className="typing-dot size-1 rounded-full bg-[#2B8A9E]" style={{ animationDelay: `${index * 0.16 - 0.32}s` }} />)}</span>
          正在搜索资料
        </span>
      ) : (
        <span className="fade-in animate-in inline-flex h-6 w-fit items-center gap-2 text-xs text-fg2 duration-300 motion-reduce:animate-none">
          {results.length > 0 && <span aria-hidden="true" className="inline-flex">
            {results.slice(0, 3).map((result, index) => <span key={`${result.domain}:${index}`} className="inline-flex rounded-[4px] shadow-[0_0_0_2px_var(--background)]" style={{ marginInlineStart: index ? -4 : 0 }}><DomainMark domain={result.domain} /></span>)}
          </span>}
          找到 {results.length} 条来源
          <ChevronRightIcon aria-hidden="true" className="size-3 text-muted-foreground" />
        </span>
      )}
    </div>
  );
}
