# Teacher image retry model-input regression

`server/src/__integration__/teacher-image-retry.test.ts` exercises committed synthetic IM → `receiveAgentRequest` → the shared vision provider method → published LingxiOS 3.8.12 control plane and Worker → actual `ModelDriver.run` input. It provisions real scoped teacher course rooms with the existing teacher fixture, uses dedicated local PostgreSQL/Redis, and never contacts production or a real model provider.

Baseline: source `06e4a364`, archived before implementation at `/tmp/lingxiloop-465-baseline`, using the exact locked published dependency. The same four tests produce three failures and one pass. Recorded inputs demonstrate:

- The PNG is never sent to a vision provider and its visual content never reaches the Worker.
- Same-message image identity survives; a separately sent image disappears on retries 1–3 after 205 later committed messages.
- Original task wording and course context survive, while the original request time is absent on retries 1–3.
- Revoked-image content remains unavailable.

The fixed suite passes all four tests with no skips in 8.5 seconds. Eleven actual Worker model calls and nine shared vision provider calls are recorded. Both image layouts execute an original attempt plus three retry controls: the first three model attempts fail deliberately, then the third retry succeeds. Every current model input retains the original instruction, image identity, derived visual content, course context, and original timestamp across simulated day boundaries. The image provider receives the exact original PNG bytes with thinking disabled, and each issued call is recorded in the shared ledger with purpose `attachment.image_read`.

Replaying the final admitted retry while the fixture would return a different image reading preserves the original run IDs and performs no further vision or Worker model call. Revoked images perform no vision I/O; missing vision configuration produces `unsupported`; an unreadable provider result produces `empty`; none invents image text.

Evidence:

- `teacher-image-baseline.log` and `teacher-image-baseline.json`
- `teacher-image-green.log` and `teacher-image-green.json`
- `teacher-image-timings.json`

Only outcomes and byte-equality booleans are saved. No prompts, image data URLs, or credentials are written to the evidence.

Reproduce after starting the repository's existing dedicated Compose fixtures and creating the empty database `lingxiloop_teacher465_test`:

```sh
docker compose -f e2e/server/compose.yaml up -d --wait
env -i PATH="$PATH" HOME="$HOME" bash -c '
  source docs/evidence/issue-465/integration-env.sh
  node --import tsx server/src/migrate-bin.ts &&
  node server/run-integration-tests.mjs --file teacher-image-retry.test.ts
'
```

This is a deterministic protocol and model-input regression. The small PNG and transcription are synthetic; it does not validate OCR quality, establish the user's production failure cause, resolve an absolute homework deadline, or exercise draft creation or teacher-confirmed publishing. Draft idempotency has separate owning integration coverage. The original production image and run records remain unavailable.
