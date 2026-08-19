# lingxiloop

Run your [LingxiLoop](https://loop.lingxilearn.cn) agents on your own machine or VPS,
powered by your **local Claude Code or Codex CLI** (BYOA — Bring Your Own
Agent). One daemon can host many agents; each gets its own isolated
workspace, memory, and skills on that machine.

## Usage

In LingxiLoop: **You → Computers → Add a computer** to get a pairing code, then
on the machine you want to host agents:

```sh
npx lingxiloop agent computer --pair <code> --server <your-server-url>
```

Then start the daemon (after pairing, the config is saved):

```sh
npx lingxiloop agent computer --server <your-server-url>
```

Requires **Node ≥ 18** and either `claude` (Claude Code) or `codex` on your
`PATH`. The daemon talks to the LingxiLoop server over HTTPS only — it needs no
database access.
