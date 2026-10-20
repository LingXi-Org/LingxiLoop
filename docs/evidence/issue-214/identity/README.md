# Original activity identity across Visualize slices

Independent review of combined source `49c26d99fa483693708fd1beb9a240fc7f563fb0` found that the outer Visualize lifetime used only message/slot while MarkdownText used the original activity identity. After a part had settled under reduced motion, a new activity in the same slot inherited the old slices' disabled smoothing.

The owning official browser test was written before the production correction. Both independent review and integrator reproduced the failure: the new 979-character part appeared all at once (`samples=[979]`). The correction uses the same original message/activity identity for Visualize's outer StreamingPart and remounts its slice subtree. No dependency, runtime, transport or schema change is involved.

The first integrator combination run passed this new case with prefixes `0,18,181,475,641,641,766,850,916,944,971,979`. That complete run was **13 passed / 2 failed**, not a full pass. The remaining failures concern the existing completion-status and color-transition sampling assertions and remain under investigation. Their original reports are retained at `artifacts/root-combined-green` (the requested output name is not a success claim). Root red evidence is at `artifacts/root-identity-red`.

Final exact-source verification and retained reports will follow before this PR is released. Media changes in these tests use controlled matchMedia subscriptions; native OS/CSS reduced-motion and official-site TLS validation are not claimed passed.
