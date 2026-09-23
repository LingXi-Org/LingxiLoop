# First body baseline (2026-09-23)

The direct SiliconFlow DeepSeek-V4-Flash benchmark used 100 paired ordinary-chat
requests per profile. `scripts/benchmark-first-body.mjs` records only timing,
token counts, and result metadata; raw samples are in
`.agent-os/benchmarks/provider-first-body.json`.

| Provider profile | First real body P50 | P95 | Failures |
| --- | ---: | ---: | ---: |
| Deep (`enable_thinking: true`, `reasoning_effort: high`) | 2,257 ms | 15,851 ms | 2/100 |
| Fast (`enable_thinking: false`, no `reasoning_effort`) | 678 ms | 3,313 ms | 1/100 |

These numbers exclude queueing, LingxiOS, SSE transport, and browser rendering.
The provider fast P95 alone exceeds the 3-second end-to-end goal. This is a
baseline, not evidence that the production end-to-end target is met. Repeat the
100-request browser measurement against an isolated production test tenant
after deployment before declaring that target achieved.
