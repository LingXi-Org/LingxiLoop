# Teacher PNG input and repeated recovery (#465)

Base: `06e4a364f1355ae2c6bc027f84aa8674b88c6e4e`. Claim and request for the missing original conversation/run/image: <https://github.com/LingXi-Org/LingxiLoop/issues/465#issuecomment-6396129618>.

Confirmed defects in current code, independently of the production incident:

1. PNG attachments were marked `unsupported` without sending original bytes to a visual model. The published LingxiOS 3.8.12 attachment API carries text, so the shared product LLM client now reads the authorized original PNG/JPEG/WebP. Its transcription is labelled model-derived, untrusted material and retains the original attachment ID and content hash. Missing configuration, unreadable/failed results and revoked access remain explicit; no text is invented.
2. Retry attachment association used the new control message's recent history. A separately sent image disappeared after 205 newer records. Recovery now anchors the existing bounded lookback to the original committed request and retains its original timestamp/ISO offset. Three retries through prior controls and assistant source references retain the task, course and image.
3. Every new runtime run could create another homework draft with a random ID. The teacher tool now derives its creation ID from scoped, committed original-request provenance and uses the application's existing locked, hash-checked idempotency. Changed content requires a revision of the existing draft. Publication still requires the teacher's explicit confirmation; repeated confirmation remains idempotent. Historical randomly identified drafts are not backfilled.
4. A live SDK call exposed `timeout must be an integer` before provider I/O: shared request budgeting supplied a fractional remaining timeout. The one-line fix floors the bounded timeout. The new regression failed before this fix and passes afterward. This is not attributed to the screenshots without their actual run records.

Verification:

- 18 focused image/reference/shared-ledger unit tests pass; server typecheck and changed-file Biome lint pass.
- [Teacher model-input acceptance](teacher-image-regression.md): baseline 3 failed / 1 passed; fixed 4 passed, no skips, 11 actual Worker inputs and 9 actual shared-client fixture vision calls. Both layouts run three controlled failures followed by a successful third retry. Replaying an admitted message reuses its original receipt without another image/model call, even if a new transcription would differ.
- Existing #447 model-input regressions rerun with the teacher regression against the final source: 12 tests pass in total.
- Teacher homework owning integration: 48 passed, including cross-run creation reuse, scope/author checks, changed-content conflict, a distinct new request, and explicit/idempotent publication (`draft-baseline.log`, `draft-green.log`).
- [Live vision receipt](live-vision.json): one real `Qwen/Qwen3-VL-32B-Instruct` call to SiliconFlow transcribed the IP and prefix present only in the synthetic PNG. Measured usage: 394 input / 70 output tokens. The shared ledger observer records usage/cost; no production data or ledger is used by this explicit opt-in test.
- Both deployment Compose files validate with interpolation disabled. Runtime remains the exact published 3.8.12; no migration is introduced.

Deployment configuration is source-only: `OPENAI_VISION_MODEL` is explicitly set to `Qwen/Qwen3-VL-32B-Instruct` for both Komodo app stacks, with the existing provider/key. An unset model intentionally disables image reading. Its CN tariff was checked from the provider's input/output component metadata on 2026-10-25: CNY1 / CNY4 per million tokens, no assumed cache discount. Sources: [vision request contract](https://docs.siliconflow.cn/docs/userguide/capabilities/vision), [CN pricing](https://www.siliconflow.cn/pricing). The authenticated provider model-list read confirmed this model is available.

To run the live test, provide the existing authorized provider credentials and ordinary synthetic server environment, then set `LINGXILOOP_LIVE_VISION=1 OPENAI_VISION_MODEL=Qwen/Qwen3-VL-32B-Instruct` and run `node --import tsx --test --test-force-exit server/src/__integration__/teacher-image-live.test.ts`. It is opt-in and skipped in routine CI. The fixture PNG is synthetic and stored under `server/src/__tests__/fixtures/teacher-image-465/`.

Production boundary: a read of `https://loop.lingxilearn.cn/api/meta` returned commit `197e2568d46de349bb3ce0a26aefbadaae8f4723`, runtime3.8.12/schema14. Git ancestry confirms it includes #447 (`ab0b5733`). This verifies the observed current deployment, not the version or failure cause of every screenshot run. The original conversation, original PNG, actual errors and absolute interpretation of “明晚20:00” remain unverified. Recovery preserves the original recorded time and existing timezone context; it does not invent a missing user timezone.

No production writes, merge, rollout or independent review occurred here. #439's LingxiOS failure-observation work is untouched. Shared integration changes are `receive.ts`, `attachments.ts`, `request-references.ts`, the new `image-input.ts`, the visual tariff and the one-line product-client timeout fix in `llm.ts`. The designated release environment owns conflicts, merge, deployment and incident closure.
