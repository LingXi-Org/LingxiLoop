# Canvas MCP Apps Web profile (#210): failure model before implementation

Baseline: e7422872a8314823794875c81b14f9393a08e15f. Research and scope: https://github.com/LingXi-Org/LingxiLoop/issues/210.

This is a fixed, first-party document editor, not a third-party plugin loader. The official App/AppBridge SDK owns the wire protocol. Existing authorized Canvas APIs and PostgreSQL own documents. Model HTML keeps its existing script-disabled sandbox.

Before implementation, the verification must cover:

- Handshake races: register all handlers before connect, accept initialized once, feed the latest snapshot, bound handshake and teardown, close transport on error/unmount. Unknown/unsupported methods must fail.
- Trust: accept messages only from the bound opaque frame; never deliver auth/session tokens to it; do not evaluate document content as HTML. Tools are restricted to the bound frame. Revalidate the user, company, project and canvas before and after async operations. Stale scopes cannot project results or trigger feedback.
- State: document snapshots, unsaved drafts and staged references are separate. Keep the draft's base revision. Out-of-order snapshots cannot roll back the editor. Remote updates cannot overwrite a dirty draft. Only a server ACK/readback can say saved.
- Saves: errors preserve draft; CAS prevents replay from applying twice. Unknown write outcome triggers readback, not blind write retry. This profile does not promise the Excalidraw operationId ledger. A later explicit save must still use the original revision until the user accepts a new baseline. Saving a copy is an explicit host action.
- Interaction: selection staging and normal edits do not start an Agent. The existing editable feedback dialog requires an explicit final send; cancel preserves the document. Reject oversized/foreign references. Never implicitly call sendMessage.
- Lifetime: preview/edit and remote updates retain the same iframe and textarea. Unmount/reload restores only acknowledged database content; warn before discarding dirty work, and retain drafts in the host while the editor is alive. No claim of cross-restart undo.
- Compatibility: legacy markdown/document/html/image/artifact cards and existing Visualize messages remain readable. No data migration, new frame type, or token-stream protocol. Keep PR204 final/cancel/streaming regressions.
- Evidence: use official tester-army/e2e with @e2e-dev/web, actual product components and SDK, screenshots and machine-readable interaction assertions. Local deterministic API fixtures are not production authorization, real provider, or Electron equivalence.

No unit tests will be added after implementation. New behavioral coverage is browser E2E and HTTP end-to-end checks against disposable PostgreSQL/Redis; existing owning checks will be rerun. The delivered scope keeps drafts in the live App and provides explicit confirmed reload (copy text manually before reload); no save-copy API or cross-restart draft store is introduced.
