# Contributing to LingxiLoop

Thanks for your interest in LingxiLoop. This guide covers how to get set up, the
checks your change needs to pass, and a couple of architecture invariants that
are enforced in CI so you don't get surprised.

By contributing you agree that your contributions are licensed under the
project's [MIT License](LICENSE).

## Getting set up

You need **Node ≥ 20**, Python 3 with IPython, **Postgres**, **Redis**, and a
WuKongIM v3 instance running locally.

```bash
createdb -h localhost lingxiloop
export DEEPSEEK_API_KEY=sk-...        # the only hard-required model credential

npm install
npm run db:bootstrap                # initialize the immutable v1 schema once
npm run dev:all                     # Vite renderer on :5180 + API server on :5181
```

Open http://localhost:5180 for the web app, or `npm run electron:dev` for the
desktop shell. Web and worker processes never execute DDL: `db:bootstrap`
accepts only an empty database or the already-marked v1 schema. Development
databases from before v1 must be dropped and recreated. Startup seeds the v1
schema with a starter team. Everything else (OAuth login, email, storage, the
sub2api LLM gateway) soft-disables when its env vars are unset — see
[`.env.example`](.env.example).

Component-specific setup lives in [`docs/`](docs/), including desktop,
deployment, and email integration notes.

## Before you open a PR

Run the same gates CI runs. All of these must pass:

```bash
npm run lint               # Biome lint (autofix with `npm run lint:fix`)
npm run typecheck          # frontend types
npm run server:typecheck   # server types
npm test                   # unit tests (node:test) for server + workers
npm run test:integration   # integration suite (needs local Postgres + Redis)
npm run guard:agent-os     # independent runtime/tool-boundary guard
npm run guard:llm-tracked  # architecture guard, see below
```

Biome is configured (`biome.json`) as a **linter only** — it is not a
formatter here, so it won't reflow existing code. The rule set is a
pragmatic subset of Biome's recommended rules: correctness and real-bug
rules are on; noisy or intentional-pattern style rules (and the a11y
group, tracked as separate follow-up work) are off.

Both TypeScript projects are `strict`. There are no frontend unit tests yet;
server and worker logic is covered by `server/src/__tests__` and
`server/src/__integration__`.

## Architecture invariants (enforced in CI)

These are product boundaries, and a guard script fails the build if they are
broken:

1. **Agent OS is independent.** Runtime code must not call or install an agent
   CLI, and the model-facing tool list must contain only strict `ipython`.
   `npm run guard:agent-os` checks this boundary.
2. **Every LLM call must be tracked** in the cost ledger. Untracked spend is a
   correctness bug here, not just an oversight. `npm run guard:llm-tracked`
   checks this.

The learning-agent coordination model is documented in
[`docs/COORDINATION.md`](docs/COORDINATION.md). Read it before changing routing,
handoffs, the Agent OS loop or WuKong events.

## Coding conventions

- Match the style of the file you're editing. The codebase leans on comments
  that explain *why* — constraints, trade-offs, and the history behind a
  non-obvious choice — not what the next line does. If your change reverses a
  decision a comment documents, update the comment.
- Keep coordination prompts shape-level and minimal. Adding per-scenario examples to fix one
  observed bug is the most expensive class of change here — see the
  anti-patterns in `docs/COORDINATION.md`.
- Prefer `any`-free, well-typed code; both tsconfigs are strict for a reason.

## UI foundation

- `components.json` and the official shadcn registry are the only source for
  reusable UI primitives. Add or refresh one with
  `npx shadcn@latest add <component>`.
- Application and domain code imports primitives through
  `@/components/ui/*`. Radix implementation imports stay inside that directory;
  do not import Radix or Base UI directly from a feature.
- Build application-specific fields and composites on those primitives instead
  of creating a second `Input`, `Select`, `Checkbox`, or other root primitive.
- Use `lucide-react` for interface icons and `framer-motion` when JavaScript
  motion is necessary. Do not add another icon set or motion runtime.

## Reporting bugs and security issues

- **Security vulnerabilities**: do **not** file a public issue — follow
  [`SECURITY.md`](SECURITY.md).
- **Bugs and features**: open a GitHub issue with clear reproduction steps and
  what you expected to happen.

## Commit and PR hygiene

- Write focused commits with a clear message explaining *why*, not just what.
- Keep a PR to one logical change; smaller PRs get reviewed faster.
- Make sure the full check list above is green before requesting review.
