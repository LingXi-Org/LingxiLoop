# Public ReAct placement failure model

Base `63948c598b9778a35941f3dcabf8ef57e2e2d6d8`, formal runtime 3.6.0; synthetic public events only.

1. Classifying every public.text delta as commentary hides actual answer text until acceptance. Current unresolved attempts must stream as answer candidates without language-keyword classification.
2. A tool-ended attempt or same-attempt tool event establishes process purpose. It must move to RunActivity and remain distinct from later attempts, including identical text.
3. Explicit chat.report_progress/observed status is commentary from its declared purpose. It must not be repeated in the answer area or copied as answer text.
4. Accepted-result association must replace only its exact source prefix with the committed answer. Process before/after it stays in RunActivity; visualize references render only through the existing validated final path.
5. Superseded/old attempts must not reappear as current answers after final-first replay. Current failed/cancelled answer fragments remain visible with truthful terminal status.
6. Refresh/replay must produce the same identity, content, and placement; tool-turn boundaries and duplicate events cannot duplicate parts or overwrite unrelated attempts.
7. Collapsing activity must leave answer streaming and approval/error/recovery controls usable. No removed aggregate-history controls are restored. Existing rich tools, native part indices, copy/citation behavior and footers remain intact.

Contract limit: 3.6.0 has no per-delta semantic purpose. The current unresolved public prefix stays in the body until public tool/result evidence establishes its role. Explicit progress belongs in the existing native chat.report_progress tool. No private reasoning or production examples are used.
