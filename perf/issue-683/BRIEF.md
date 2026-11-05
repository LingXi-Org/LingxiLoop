# Slides generation pilot — issue 683

Fixed starting source: bb1186f4, formal LingxiOS 3.8.25. Existing receipt/field fixes and Visualize retirement are already present and are not reimplemented.

Question: for the same six-page educational Slides content, does asking for one complete first-page save and subsequent batches of at most two pages reduce the time until an editable saved page compared with one whole-deck save?

Use the existing DeepSeek-V4.1-Flash / SiliconFlow configuration, native Worker, product authorization, PostgreSQL, shared model ledger and recording IM. No production conversation, original private manuscript or user data is replayed. Limits: one run at a time, at most32 model calls,2,000,000 tokens and480 seconds per measured run. The initial24-call pilot failed and is retained separately (its Date-to-string timestamps were floored to seconds). The measured matrix uses explicit equal budgets and millisecond Date values. Proceed to three interleaved pairs only if the chain is usable. A/B changes only the requested saving strategy; current product skill guidance stays identical. This tests requested strategies, not a causal estimate of the whole historical patch.

Record enqueue→worker start, first saved valid index with referenced nonempty HTML, first answer operation/delta, final completion, call/correction counts, input/output/cache tokens, write sizes, checks, verified outcome and durable delivery. A saved-file timestamp is a server-side readiness observation, not browser first paint. Stage/model times may overlap and are not summed into wall time.

Success guards: all six intended page topics saved, format problems0, actual satisfied outcome and delivered message, no unresolved/unknown effects. Retain partial/failure samples. Generated test content and public answer may be persisted as fixtures; never persist API keys, private prompts or provider request headers.

This is a small pilot (not a10+10 browser p75 study). Report each sample and medians/ranges only; no reliable p75/p95, no claim about the historical690.973s production run. Browser save/reopen/render/export acceptance is a separate check and will be labelled with its actual scope. Deployment remains with the sole release owner.

The failed pilot exposed two product defects before the matrix: source-derived430 font weights fail the editable Slides HTML grammar, and product CAS errors used an unrecognized runtime code. The candidate projects only new Slides defaults to400, preserves Design/saved documents, and uses native version_conflict/refresh diagnostics. Both A/B strategies use this same candidate. They do not measure the causal effect of those fixes.
