# Passive historical reference parser

`shared/assistant-directive-parser.ts` adapts the parsing helpers from ZCode's
`packages/ui/src/lib/assistantDirectiveParser.ts` at commit
`0a1fc56d279fd1001f78387bd81aec1c26767411`, under Apache-2.0.
Copyright and license attribution are retained in `LICENSE.md` and
`THIRD_PARTY_NOTICES.md`. Only passive directive/Markdown syntax parsing remains;
no ZCode guest, frontend, skill, scripts, vendor assets or runtime are shipped.
`shared/retired-visualize.ts` uses those helpers solely to locate references in
existing durable messages for authenticated, non-executable archive export.
