# Durable unsafe-prefix integration fixture

Base: `dcd71bd269bcc9281e95bc85fa9263766456ad8f`.

The real integration job [119017666014](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39537549519/job/119017666014) reported 357 passed, one failed and 14 skipped. The only failure is the unsafe case's unconditional stable-ID assertion at `durable-public-activity.test.ts:118`: the rejected, subsequently replaced no-tool candidate is now archived by #262/PR270, so it is absent from the final foreground. Its safe prefix must remain in authorized activity history. Changing product projection to satisfy that obsolete foreground assertion would reintroduce the rejected candidate.

Before changing the fixture, preserve these failure boundaries:

- A missing final safe answer must still fail: explicitly require a completed response containing the synthetic driver's successful replacement text and bind its accepted public response identity.
- Archiving must not erase the originally visible safe prefix: require the exact text under its original stable activity ID in history, while excluding that ID from the final foreground.
- Neither replay nor authorized history may contain `PRIVATE_STREAM_SENTINEL`; keep the existing public-event leakage checks.
- Cancelled/revoked/tool/final-stream cases keep their existing expectations. No product, authorization, runtime or delivery code changes.

Validation is limited to this owning integration file against dedicated local PostgreSQL/Redis, using the existing formal 3.6.0 dependencies and a synthetic model driver. No provider or production requests are permitted. The original CI failure is the red evidence; local outcomes will be recorded separately without treating skipped or unrun tests as passed.
