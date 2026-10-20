# #219 current-main preparation

Current-main base: `c6c47bddeabb4488f9fe93391f15c695a528260c`. Complete original chain: PR223 `dc4bc88b81f0b9011c7540e4dc7f0889cab23778` → repair `f80924de67dd8bd8734c1af62b1f442bae2ce8a6` → PR231 `945fd9cd2cda8c906d78f7b42b9db30f89478337`. The preparation branch retains these original ancestors. Candidate `6cde5535f598cb8bb9c90ba89c634d8bede9d265` has a tree identical to the locally tested `4b9c08d4eda04b875bec44ea6982a14e271173fd`; this README is evidence-only.

All original product implementation, dependencies, authorization and migrations from the complete chain are preserved. All other current-main blobs, including #229 packaging, are preserved. Formal runtime stays3.5.6. No #216 author branch is modified.

## Fresh short checks

- Web, Node, Server and E2E typechecks passed; E2E typecheck was repeated after the selector correction.
- Existing web smoke:65/65, zero failures/skips.
- Actual-source private-recovery/model/submission projection probe:6/6. This probe is supplementary synthetic evidence, not HTTP/PostgreSQL authorization acceptance.
- First official-browser run:6/7. The last native 14-block case used a global paragraph locator that matched five nodes and failed before bold typing.
- Correction: assert the actual DOM selection is inside the labelled native editor and its nearest block content has type paragraph. Preserve all original block insertion, keyboard, visible-bold and stored-bold assertions. No arbitrary first match, injected editor state, whole-test retry, skip, sleep or replacement native controls.
- Corrected official-browser run:7/7, zero skips/retries, run `01a15882-2537-74ee-9a78-75c11dc4344a`. This reuses installed dependencies/browser cache; it is not a new cold/restart matrix.
- Two initial harness setup errors are retained separately: an incorrect CLI filename and an output directory outside the official runner project root. Neither executed tests.

Raw red/green reports and logs are alongside this file. Large private traces remain in the ignored `.codex-tmp/pr219-main-prep` tree.

## Actual release dependency

Normal migration preflight still returns `expected 47, found 48`, with zero database connections. No migration was borrowed into this candidate. Product0048 adds11 nullable JSONB columns; its body has no intrinsic dependency on native schema13. But the agreed0047 is #216's packaged runtime upgrade marker and must travel with its real runner and qualified runtime. Copying only its `SELECT 1` marker would make a contiguous number sequence without qualifying the native upgrade.

The feature can function on3.5.6/schema12 (prior branch HTTP59/59 and47→48 evidence), but those prior tests borrowed0047 and do not qualify a native12→13 deployment. Under the present reserved0047/0048 sequence, formal integration waits for #216. An independent release would require an explicit coordinated migration ownership/order change and real old-data/no-op validation; none is invented here, and no existing migration is removed or renumbered.

Next: integrate the accepted #216 runtime and actual0047/runner, preserve0048, then verify real46→47→48/native12→13 preservation, second no-op, active-capture/lease refusal, owning HTTP cases and exact combined CI. This draft is not release-ready merely because its UI short checks passed.
