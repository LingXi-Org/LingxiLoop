"use client";

// MIT © AgentbaseAI Inc. Pinned source and adaptation ledger:
// third_party/assistant-ui/streaming-text/README.md
// The word renderer, entry/color transitions and caret below are upstream code.

import { type ComponentProps, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { clamp } from "../../../../third_party/assistant-ui/streaming-text/upstream/utils/range";

export interface Segment {
  text: string;
  mono?: boolean;
}

export interface StreamingWord { word: string; mono?: boolean; separator?: string; prefix?: string; start?: number }

export const STREAMING_WORD_BUDGET = 128;
const colorSettleMs = 700;
const tokenText = ({ word, separator = " ", prefix = "" }: StreamingWord) => prefix + word + separator;
function staticWords(words: StreamingWord[], start: number, end: number, sourceText?: string): ReactNode {
  if (start === end) return '';
  // Markdown provides exact UTF-16 boundaries, including the token's prefix
  // and separator. Read only the endpoints instead of copying/joining history.
  if (sourceText !== undefined) {
    const from = words[start]?.start;
    const to = end === words.length ? sourceText.length : words[end]?.start;
    if (from !== undefined && to !== undefined) return sourceText.slice(from, to);
  }
  const selected = words.slice(start, end);
  // The Markdown adapter already owns inline-code styling. Preserve the
  // standalone upstream component's optional mono segments as well.
  if (!selected.some(word => word.mono)) return selected.map(tokenText).join("");
  return selected.map((token, index) => token.mono
    ? <span key={index}>{token.prefix}<span className="bg-foreground/[0.06] rounded-md px-1.5 py-0.5 font-mono text-[0.85em]">{token.word}</span>{token.separator ?? " "}</span>
    : tokenText(token));
}

export function StreamingText({
  segments,
  count,
  streaming,
  className,
  tokens,
  sourceText,
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
  // The Markdown leaf's original text, paired with token.start boundaries.
  sourceText?: string;
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
  const shownCount = Math.floor(clamp(count, 0, words.length));
  const root = useRef<HTMLElement | null>(null);
  const [settled, setSettled] = useState(!streaming);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const previousRange = useRef({ start: shownCount, end: shownCount });
  useEffect(() => {
    if (streaming) { setSettled(false); return; }
    const timer = setTimeout(() => setSettled(true), colorSettleMs);
    return () => clearTimeout(timer);
  }, [streaming]);
  const start = animate && !settled ? Math.max(0, shownCount - Math.max(0, STREAMING_WORD_BUDGET - trailing)) : shownCount;
  // Keep selected DOM nodes in place. New text remains immediately readable,
  // but gets no extra animation wrappers until selection leaves this leaf.
  const range = selection && selection.end <= shownCount ? selection : { start, end: shownCount };
  useLayoutEffect(() => { previousRange.current = range; });
  useEffect(() => {
    if (range.start === range.end && !selection) return;
    const changed = () => {
      const selected = document.getSelection();
      const element = root.current;
      const intersects = element && selected && !selected.isCollapsed && selected.rangeCount
        && selected.getRangeAt(0).intersectsNode(element);
      setSelection(current => intersects ? current ?? previousRange.current : null);
    };
    document.addEventListener('selectionchange', changed);
    return () => document.removeEventListener('selectionchange', changed);
  }, [range.start === range.end, Boolean(selection)]);

  const Root = inline ? "span" : "p";
  return (
    <Root
      ref={element => { root.current = element; }}
      data-slot="streaming-text"
      className={cn(
        !inline && "min-h-[8.5rem] max-w-sm text-sm leading-relaxed text-pretty",
        className,
      )}

      {...props}
    >
      {staticWords(words, 0, range.start, sourceText)}
      {words.slice(range.start, range.end).map(({ word, mono: isMono, separator = " ", prefix = "" }, index) => {
        const i = range.start + index;
        const fresh = streaming && shownCount - 1 - i + trailing < 2;
        return (
          <span
            key={i}
            data-streaming-word=""
            className={animate ? "fade-in animate-in fill-mode-both duration-500 motion-reduce:animate-none" : undefined}
          >
            {prefix}
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
      {staticWords(words, range.end, shownCount, sourceText)}
      {caret && streaming && shownCount > 0 && (
        <span
          aria-hidden
          data-streaming-caret=""
          className="-mb-0.5 ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-blue-500 dark:bg-blue-400"
        />
      )}
    </Root>
  );
}
