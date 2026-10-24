# Current execution identity binding

Development baseline: `31e719e47b6a8c9826d0e6430a28de434d9bb1aa`, formally installed LingxiOS 3.8.11, Node 24.19.0. This product change supplements the earlier investigation in [Draft #413](https://github.com/LingXi-Org/LingxiLoop/pull/413). The original production symptom remains unreplicated; a missing context contract is established, not its causal contribution to that symptom.

## Confirmed boundary and change

The published 3.8.11 `src/prompts/provider.ts` builds the persona block with `trust: 'preference'` and uses `work.agentId` in the prompt cache key, but supplies no current agent ID/name/role binding to the model. `src/prompts/sections.ts` provides platform identity and data-trust rules, not the current product agent identity. `src/runtime/policy.ts::turnInputItems` renders `authorName` and `authorKind`; it does not include the canonical `authorId` as a separate field. Native conversation messages currently use the author ID as their author name, so this finding alone does not establish upstream serialization as the production root cause. Upstream source locations are recorded for coordination; no runtime source was patched or vendored.

The product already loads fresh persona name/role/instructions through `loadRuntimeBinding` for the authorized current work. `ProductRuntimePolicy` now adds one short source rule plus a separate ordinary user-data item:

- `currentAgent.id` comes from the current work; name and role come from that authorized persona.
- `historicalAuthors` carries recorded author IDs, display names and kinds, deduplicated by kind/ID. Historical first-person content retains its source identity.
- The item is regenerated on every policy call, including empty history, profile edits and restored prompt candidates. Spoofed fields in product observations are not used to construct it.

The editable `system_prompt` remains exclusively in the persona preference block. Names, roles and historical metadata are values in user data, never interpolated into trusted instructions. The history index supplements the existing runtime input; it does not rewrite body text, message authors, session identity, sender binding, grants or authorization. The #398 homework-help implementation is unchanged.

## Necessary self-tests

- Baseline with the new focused regression: 0/3 pass, all fail because the current speaker binding is absent (`0 !== 1`). This is a structural regression, not a model-identity reproduction.
- Candidate: 3/3 pass, 0 skipped, 3.15 s. Tests exercise current work/profile versus historical authors and spoofed observations, compiled source rules, editable preference trust, restored prompt candidates/profile refresh, empty history, and distinct author kinds with the same ID/name. The tests use public LingxiOS `buildPromptContext` and product policy hooks; they do not claim a real model response.
- `node_modules/.bin/tsc -p server/tsconfig.json --noEmit`: pass.
- `node_modules/.bin/biome lint server/src/agent-runtime/context.ts server/src/__tests__/runtime-identity-context.test.ts`: pass.
- Initial isolated test setup omitted the required `LINGXILOOP_INVITE_BASE_URL`; corrected to loopback before collecting the baseline/candidate results. No model or database connection was made.

Focused command (synthetic configuration, no developer dotenv):

```sh
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test DOTENV_CONFIG_PATH=/dev/null \
  DATABASE_URL=postgresql://identity-unit@127.0.0.1:9/identity_test REDIS_URL=redis://127.0.0.1:9 \
  OPENAI_API_KEY=identity-unit-key WUKONG_USER_TOKEN_SECRET=identity-unit-secret \
  LINGXILOOP_INVITE_BASE_URL=http://127.0.0.1:9 \
  node --import tsx --test --test-force-exit server/src/__tests__/runtime-identity-context.test.ts
```

Per the user's latest scope, no independent review, additional real-provider run, browser replay, broad regression or deployment was started. Earlier provider/browser evidence in #413 predates this change. Memory/compaction behavior, long restored sessions, production-model parity and explicit sage handoff remain unverified; this is bounded context hardening, not complete #408 acceptance. Keep #408 open. CI for the published candidate is pending. Reverting this commit removes the context addition without schema or data migration.
