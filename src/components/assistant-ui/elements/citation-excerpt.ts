// Presentation-only cleanup of retrieval excerpts for the citation card.
// The stored evidence stays verbatim; only what the reader sees changes.

const PAGE = /\[\[PAGE:(\d+)\]\]/g;
const KINDS = new Set(["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv", "txt", "md", "epub", "html"]);
// A retrieval chunk usually starts mid-page; a page marker this early means
// everything before it is the tail of the previous page.
const LEAD_LIMIT = 160;
const MATCH_THRESHOLD = 0.35;

export function readableTitle(title: string) {
  const extension = /\.([a-z0-9]{2,5})$/i.exec(title)?.[1];
  const kind = extension && KINDS.has(extension.toLowerCase()) ? extension : "";
  const base = kind ? title.slice(0, -kind.length - 1) : title;
  return { name: base.replace(/_+/g, " ").replace(/\s+/g, " ").trim() || title, kind: kind.toUpperCase() };
}

export function cleanExcerpt(excerpt: string, truncated = false) {
  const pages = [...excerpt.matchAll(PAGE)].map((match) => Number(match[1]));
  const first = excerpt.search(PAGE);
  const dropLead = truncated && first > 0 && first <= LEAD_LIMIT;
  const body = (dropLead ? excerpt.slice(first) : excerpt)
    .replace(PAGE, "\n\n").replace(/\n{3,}/g, "\n\n").trim();
  const clippedStart = truncated && first !== 0 && !/^(?:[-*+>#|]|\d+[.)]\s)/.test(body);
  return { pages, text: `${clippedStart ? "…" : ""}${body}${truncated && body ? "…" : ""}` };
}

export function pageLabel(pages: readonly number[]) {
  if (!pages.length) return "";
  const low = Math.min(...pages), high = Math.max(...pages);
  return low === high ? `第 ${low} 页` : `第 ${low}–${high} 页`;
}

function tokens(text: string) {
  const result = new Set<string>();
  for (const run of text.match(/[㐀-鿿]+/g) ?? [])
    for (let index = 0; index < run.length - 1; index++) result.add(run.slice(index, index + 2));
  for (const word of text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []) result.add(word);
  return result;
}

/** Collapsed view: start one sentence before the supporting sentence so it is visible without expanding. */
export function focusExcerpt(text: string, sentence: string | null) {
  const at = sentence ? text.indexOf(sentence) : -1;
  if (at <= 0) return text;
  const boundaries = [...text.slice(0, at).matchAll(/[。！？；!?;\n]+/g)];
  const start = boundaries.length > 1 ? boundaries[boundaries.length - 2] : undefined;
  if (!start) return text;
  const rest = text.slice(start.index + start[0].length).trimStart();
  return rest.startsWith("…") ? rest : `…${rest}`;
}

/** The excerpt sentence that most plausibly supports the claim, or null when no sentence clearly does. */
export function matchSentence(claim: string, text: string) {
  const wanted = tokens(claim);
  if (wanted.size < 2) return null;
  let best: { sentence: string; score: number } | null = null;
  // Colons split too, so a highlight never swallows the clause that follows it.
  for (const raw of text.split(/[。！？；：!?;:\n]+/)) {
    const sentence = raw.replace(/^[…\s]+|[…\s]+$/g, "");
    const found = tokens(sentence);
    let shared = 0;
    for (const token of wanted) if (found.has(token)) shared++;
    const score = shared / wanted.size;
    if (score > (best?.score ?? 0)) best = { sentence, score };
  }
  return best && best.score >= MATCH_THRESHOLD ? best.sentence : null;
}
