/**
 * Tiny pure text-safety helpers shared across Agent OS. No imports or side effects.
 */

/** Strip UNPAIRED UTF-16 surrogates. A string sliced mid-emoji (e.g.
 *  `body.slice(0, N)` cutting a surrogate pair) leaves a lone high/low surrogate.
 *  A strict provider JSON parser can reject the whole request body, which
 *  then POISONS a persistent transcript (every later turn re-sends it → the agent
 *  is wedged). Scrub it at every boundary where our text can reach a model: the
 *  CLI's output (tool results) and anything the daemon sends to the engine. */
export function stripLoneSurrogates(s: string): string {
  return s
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}
