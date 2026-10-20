"use client";

// MIT © AgentbaseAI Inc. Pinned source and adaptation ledger:
// third_party/assistant-ui/streaming-text/README.md
// The word renderer, entry/color transitions and caret below are upstream code.

import { type ComponentProps, useMemo } from "react";
import { cn } from "@/lib/utils";
import { take } from "../../../../third_party/assistant-ui/streaming-text/upstream/utils/range";

export interface Segment {
  text: string;
  mono?: boolean;
}

export interface StreamingWord { word: string; mono?: boolean; separator?: string }

export function StreamingText({
  segments,
  count,
  streaming,
  className,
  tokens,
  trailing = 0,
  caret = true,
  inline = false,
  animate = true,
  ...props
}: Omit<
  ComponentProps<"p">,
  "children" | "segments" | "count" | "streaming"
> & {
  segments: Segment[];
  count: number;
  streaming: boolean;
  // Markdown supplies lossless text leaves and their distance from the tail.
  tokens?: StreamingWord[];
  trailing?: number;
  caret?: boolean;
  inline?: boolean;
  animate?: boolean;
}) {
  const words = useMemo<StreamingWord[]>(
    () =>
      tokens ?? segments.flatMap((segment) =>
        segment.text
          .split(" ")
          .map((word) => ({ word, mono: segment.mono ?? false })),
      ),
    [segments, tokens],
  );
  const shown = take(words, count);

  const Root = inline ? "span" : "p";
  return (
    <Root
      data-slot="streaming-text"
      className={cn(
        !inline && "min-h-[8.5rem] max-w-sm text-sm leading-relaxed text-pretty",
        className,
      )}

      {...props}
    >
      {shown.map(({ word, mono: isMono, separator = " " }, i) => {
        const fresh = streaming && shown.length - 1 - i + trailing < 2;
        return (
          <span
            key={i}
            data-streaming-word=""
            className={animate ? "fade-in animate-in fill-mode-both duration-500 motion-reduce:animate-none" : undefined}
          >
            <span
              data-streaming-fresh={fresh}
              className={cn(
                "transition-colors duration-700 motion-reduce:transition-none",
                fresh && "text-blue-500 dark:text-blue-400",
                isMono &&
                  "bg-foreground/[0.06] rounded-md px-1.5 py-0.5 font-mono text-[0.85em]",
              )}
            >
              {word}
            </span>{separator}
          </span>
        );
      })}
      {caret && streaming && shown.length > 0 && (
        <span
          aria-hidden
          data-streaming-caret=""
          className="-mb-0.5 ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-blue-500 dark:bg-blue-400"
        />
      )}
    </Root>
  );
}
