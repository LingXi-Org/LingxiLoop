# Issue 158 directory audience acceptance

`npm ci --cache /tmp/lingxi-158-npm-cache --ignore-scripts --no-audit --no-fund` installs the frozen root lock (LingxiOS 3.4.7). No lockfile change is required.

Run real PostgreSQL integration and the existing permission/runtime checks serially:

```sh
node e2e/server/run.mjs --file directory-audience.test.ts --file permission-resolver.test.ts --file native-collaboration.test.ts --file runtime-tool-recovery.test.ts
```

Run browser acceptance using tester-army/e2e 0.17.0 and official @e2e-dev/web 0.12.0:

```sh
node e2e/directory-audience/run.mjs
```

The browser driver starts disposable PostgreSQL/Redis, migrates only `lingxiloop_directory_test`, and runs a local contract harness on port 53158. It excludes developer dotenv files and real provider credentials. It uses production native tools, product permissions and the published native worker with synthetic identities, a scripted model, and recorded IM transport. Each audience reads the directory and completes a following turn with a durable final reply. Unique ingress message IDs avoid stale deduplication receipts when repeating the fixture.

Audience A sees its DM, the shared room, and its second-project room. Audience B sees its DM and the shared room. The integration additionally covers a shared A+B frozen audience, original principal outside the narrower audience, a deleted candidate, Agent departure, missing identity, principal and project revocation, departed audience members, cross-tenant and left-Agent candidates, injected query/code failures and a real PostgreSQL statement timeout. No hidden candidate count is returned.

Sanitized checked evidence is in `evidence/`; raw browser output is ignored in `.output/` and local driver receipts in `.e2e/directory-audience/`. Browser screenshots show this contract harness, not the full product SPA. Real provider behavior, real WuKong delivery and a 24-hour soak are unverified. This work does not change runtime retry budgets, capabilities, shared authorization, migrations or deployment.
