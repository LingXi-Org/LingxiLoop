// Adapted from usememos/memos components/MemoContent/useSearchMatchHighlight.ts at 8120a6c (MIT). See README.md.
import { type RefObject, useEffect } from "react";
import { findSearchMatches, prepareSearchTerms } from "./search-match";

/**
 * The registry name every memo body shares. Styled by `::highlight(memo-search-match)` in
 * `index.css`; painting is the browser's job, the rendered DOM is never touched.
 */
export const SEARCH_MATCH_HIGHLIGHT_NAME = "memo-search-match";

/**
 * Subtrees whose text is not the memo's prose: KaTeX renders every formula twice (MathML for
 * assistive tech plus the visual layout), and SVG text (Mermaid) is not paintable by highlights.
 */
const SKIPPED_SUBTREES = ".katex, svg";

const isHighlightApiSupported = (): boolean =>
  typeof CSS !== "undefined" && typeof CSS.highlights !== "undefined" && typeof Highlight === "function";

/** The shared highlight, registered on first use. Looked up each time so a replaced registry is honored. */
const getSearchMatchHighlight = (): Highlight => {
  const existing = CSS.highlights.get(SEARCH_MATCH_HIGHLIGHT_NAME);
  if (existing) return existing;
  const highlight = new Highlight();
  CSS.highlights.set(SEARCH_MATCH_HIGHLIGHT_NAME, highlight);
  return highlight;
};

const collectMatchRanges = (root: HTMLElement, preparedTerms: readonly string[]): Range[] => {
  const document = root.ownerDocument;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      return (node as Element).matches(SKIPPED_SUBTREES) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
    },
  });

  const ranges: Range[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    for (const match of findSearchMatches(text.data, preparedTerms)) {
      const range = document.createRange();
      range.setStart(text, match.start);
      range.setEnd(text, match.end);
      ranges.push(range);
    }
  }
  return ranges;
};

/**
 * Paints every occurrence of the active search terms inside `rootRef` with the CSS Custom
 * Highlight API. Matching follows the server's `content.contains` semantics (case-folded
 * substring), so what the filter matched is what lights up.
 *
 * Rendering inside the root is not synchronous — code blocks colorize, math and diagrams
 * load lazily, link cards arrive — so the ranges are rebuilt whenever the subtree changes,
 * coalesced to one pass per animation frame. Browsers without the API render unhighlighted.
 */
export function useSearchMatchHighlight(rootRef: RefObject<HTMLElement | null>, terms: readonly string[]): void {
  // Identity-insensitive: the same words in the same order never restart the effect.
  const termsKey = terms.join("\u0000");

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !termsKey || !isHighlightApiSupported()) return;

    const preparedTerms = prepareSearchTerms(termsKey.split("\u0000"));
    if (preparedTerms.length === 0) return;

    const highlight = getSearchMatchHighlight();
    let ownRanges: Range[] = [];
    let frame: number | null = null;

    const clear = () => {
      for (const range of ownRanges) highlight.delete(range);
      ownRanges = [];
    };

    const apply = () => {
      frame = null;
      clear();
      ownRanges = collectMatchRanges(root, preparedTerms);
      for (const range of ownRanges) highlight.add(range);
    };

    const scheduleApply = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(apply);
    };

    apply();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(root, { childList: true, characterData: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      clear();
    };
  }, [rootRef, termsKey]);
}
