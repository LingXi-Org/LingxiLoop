#!/bin/sh
# cumora-web — small ergonomics wrapper around OpenCLI for the two most
# common things an agent wants from the browser: search and read.
#
# All real browser commands go through `opencli browser ...` directly —
# this script is just a friendly entry point so the LLM doesn't have to
# remember the multi-step open + extract dance for a quick search.
#
# Usage:
#   cumora-web search "<query>" [--limit N]
#       Open DuckDuckGo's HTML endpoint (no JS required, no captcha),
#       extract the top N result links + snippets, print to stdout.
#
#   cumora-web read <url>
#       Open the page in the agent's Chromium, wait for the DOM, extract
#       the main content. Use this when a target URL is JS-rendered or
#       behind a login the agent has on the persistent profile.
#
# For anything beyond search-and-read — clicking, filling forms,
# multi-step flows, scraping a specific element — call `opencli browser
# default <verb>` directly.
set -eu

# OpenCLI uses a per-invocation "session" id to keep tab leases distinct.
# A single agent only needs one session — use the agent id when
# available so logs are legible, fall back to a stable string.
SESSION="${CUMORA_AGENT_ID:-default}"

usage() {
  cat <<'EOF' >&2
usage:
  cumora-web search "<query>" [--limit N]
  cumora-web read <url>

For anything else (click, fill, extract, multi-step flows), call
`opencli browser <session> <verb> ...` directly.
EOF
  exit 64
}

case "${1:-}" in
  search)
    shift
    QUERY="${1:-}"
    [ -n "$QUERY" ] || usage
    shift
    LIMIT=5
    while [ $# -gt 0 ]; do
      case "$1" in
        --limit) LIMIT="${2:-5}"; shift 2 ;;
        --limit=*) LIMIT="${1#*=}"; shift ;;
        *) shift ;;
      esac
    done
    # URL-encode the query: shell-side without curl --data-urlencode
    # since we want the URL in the opencli arg, not the body.
    ENCODED=$(printf '%s' "$QUERY" | jq -sRr @uri)
    URL="https://html.duckduckgo.com/html/?q=${ENCODED}"
    opencli browser "$SESSION" open "$URL" >/dev/null
    # `find --css "h2 a"` returns DDG-html result entries as
    # {entries: [{text, attrs: {href, ...}}]}. Pipe through jq to
    # flatten into one "n. title\n  url" block per hit, which is
    # what the LLM actually wants to read.
    # `find --css "h2 a"` returns DDG-html result entries; their href
    # is wrapped as "//duckduckgo.com/l/?uddg=<percent-encoded-real-url>".
    # We strip the wrapper via python (jq has @uri encode but no
    # decode, and python3 ships in the image anyway). The LLM sees
    # a usable link instead of a DDG redirect.
    opencli browser "$SESSION" find --css 'h2 a' --limit "$LIMIT" 2>/dev/null \
      | python3 -c '
import json, sys, urllib.parse as up
data = json.load(sys.stdin)
for i, e in enumerate(data.get("entries", []), 1):
    href = e.get("attrs", {}).get("href") or ""
    if "duckduckgo.com/l/" in href:
        q = up.urlparse(href).query
        href = up.parse_qs(q).get("uddg", [href])[0]
    title = e.get("text", "")
    print(str(i) + ". " + title)
    print("   " + href)
'
    ;;
  read)
    shift
    URL="${1:-}"
    [ -n "$URL" ] || usage
    opencli browser "$SESSION" open "$URL" >/dev/null
    # `extract` returns a JSON envelope with markdown in .content.
    # It auto-picks <main>/<article>/<body> when --selector is
    # omitted, which is exactly what we want for an arbitrary page.
    # The default chunk_size (20k) caps long pages; the LLM can
    # follow next_start_char if it needs more.
    opencli browser "$SESSION" extract 2>/dev/null | jq -r '.content // empty'
    ;;
  ''|--help|-h|help)
    usage
    ;;
  *)
    echo "cumora-web: unknown subcommand: $1" >&2
    usage
    ;;
esac
