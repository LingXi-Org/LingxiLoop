# Failure modes recorded before implementation

- Streaming, code-fenced, malformed, or unauthorized references must never execute.
- Generated HTML must never enter the host document or gain its origin, storage, credentials, navigation or arbitrary tool access.
- Forged messages, stale pages, different iframe sources and synthetic gestures must fail closed.
- State saves must serialize and restore across collapse, sessions, variants and capacity eviction.
- Retained iframe moves must not reload the document; detached pages must reject active actions.
- Snapshot capture can fail on unavailable clipboard, canvas, fonts or cross-origin assets; report the error and allow retry.
- Offline, acquisition and handshake failures must expose upstream retry states.
- Theme, sizing, focus, reduced motion, dialogue layout and complete Tweak control semantics must match upstream.
- Existing questionnaire, canvas, memory, citations, attachments and chat runtime must remain untouched.

Acceptance is owned by the official tester-army/e2e harness, using identical upstream/product fixtures. No after-the-fact unit tests are added.
