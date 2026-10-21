# Authorized PR271 narrow fix handoff

Frozen code HEAD: `2be6ff884728039b8730262d46dc4bc02253809e`.
Local-only tree `/workspace/LingxiLoop-public-projection-review`, branch
`review/public-projection-267-270-271`. Nothing pushed, merged or deployed.

The previously frozen independent review still describes the original PR271
P2. This follow-up records my role as its authorized fix author; the parent must
independently review this correction before GO.

Commit order for integration:
1. PR267 exactd88c4b5d0e42ba6d4bd48785c526c18e888dfa48 (independent codeGO; latest required CI green; keep260 open).
2. PR270 exact38ec4af6d79b695792a2d4afc369ee8161767fb5 (independent codeGO; last integration check pending).
3. PR271 exactf2d4509e2fe696dedbb8eadbd13fb4e9c3fcc520 (original P2/fixture gaps recorded).
4. Local test-only `14dba6e09b0fa76cf9bd2902f9bb8b8d74fd987c`: two combined fixture expectations, no product code.
5. Local narrow fix `2be6ff884728039b8730262d46dc4bc02253809e`: observed-progress delivery classification, one public-state test, failure model and evidence note.

Product correction: within the existing confirmed-save/current-message/current-reference branch, explicit public delivery=failed now says delivery failed and no usable reference was delivered. Only pending says waiting. not_observed/null say unconfirmed. Existing source/request/fence checks and delivered-only reference activation remain unchanged. No runtime interface, receipt, auth, permission or path code changed.

Test-first evidence: failure model extended before the narrow test; failing diff saved before implementation. The real public consumeAssistantMessage synthetic case reproduced failed as waiting, then the new test failed on that exact output. After correction the complete affected combination ran once:35/35 passed in49.5 seconds across new boundary/repair/observed-progress, durable/run activity, assistant transport/public events and the Web harness. Four touched code/test files passed lint. No provider, browser, SQL or production test was run; the unit test process used an explicit local closed-port DB URL to avoid production destinations.

Earlier combination evidence remains intact:8/8 boundary and6/6 Web harness after test-only alignment, with both initial reds preserved. The source PR271 full Web job log was inaccessible (GitHub artifact redirect HTTP403), not bypassed. Public job metadata + local owning red established the queued fixture gap; final full exact integration CI is still the parent's gate.

All files and evidence are public source or synthetic. Forbidden diagnostics and private conversation/HTML/screenshots were not accessed. The current266 production release remains independent.
