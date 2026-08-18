/**
 * Tiny pure text-safety helpers shared across the agent stack (cloud + the
 * bundled BYOA daemon). No imports, no side effects.
 */

/** Strip UNPAIRED UTF-16 surrogates. A string sliced mid-emoji (e.g.
 *  `body.slice(0, N)` cutting a surrogate pair) leaves a lone high/low surrogate.
 *  Once that reaches the Anthropic API its strict JSON parser rejects the whole
 *  request body with "400 … not valid JSON: no low surrogate in string", which
 *  then POISONS a persistent transcript (every later turn re-sends it → the agent
 *  is wedged). Scrub it at every boundary where our text can reach a model: the
 *  CLI's output (tool results) and anything the daemon sends to the engine. */
export function stripLoneSurrogates(s: string): string {
  return s
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}
