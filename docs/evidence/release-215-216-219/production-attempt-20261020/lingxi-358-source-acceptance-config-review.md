# Independent recovered-source acceptance and configuration restoration review

Reviewed locally on 2026-10-20. Reviewer made no production/API request or mutation. Root remains sole executor.

Result: no P1/P2 finding in the reviewed configuration restoration, acceptance verifier or receipt collector. Their `node --check` checks passed. Independent assertions over the actual local recovery evidence also passed.

## Reviewed code identities

- Final executed `restore-compatible-source-continuation.mjs`: `4fb03306e39d9c4588e5b4a5f53321e6077a4050da1161fe46ea0344101a4955`. The only addition since the prior review is the recommended exact prior-recovery planHash/source binding.
- `restore-source-config.mjs`: `87e751b02eabaf732afb2cc63a7c8d6038538482ecb33e40d6223a11465e67d6`.
- `verify-source-recovery.mjs`: `dfc44e75ea88e750b9c87125bcb76e5facef1fa0947596720439cd8c3d1ed8a1`.
- `collect-source-recovery-receipts.mjs`: `9adaf13148852333a7b01856fbfeb504e3ab39695f46a0ebefa0122040161275`.

All files are under `/tmp/lingxi-358-production/`.

## Actual recovered-source evidence

Independently loaded and asserted the underlying files, rather than relying only on their overall success flags:

- The continuation is complete at 13:20:31.573 UTC; exact final runtime3.5.6/native12/product46/protocol11/schema hash and all46 migration checksums match the original source.
- All four distinct expected Web/Worker stack-service pairs have their original container IDs, image IDs, source commit, runtime policy fields and restart counts0; all are running and healthy, with no restart or OOM flag.
- Postflight at 13:21:48.472 UTC records three connected servers, idle application stacks and exact original images on both hosts.
- `/api/health`, `/readyz`, `/api/health/dependencies` and `/api/meta` all returned200. Public metadata exactly matches the baseline source release.
- Four StartContainer updates are Complete/success:true: WebA `6ad7690ce06d5e1f79836b5c`, WebB `6ad76a39e06d5e1f79836b9d`, WorkerA `6ad76a5de06d5e1f79836ba5`, WorkerB `6ad76a7ee06d5e1f79836bad`.
- The14-update collector preserves all terminal results and identifies only the two expected failures: preparation6ad76383e06d5e1f79836a3a and read-only state check6ad76925e06d5e1f79836b60. It does not misreport them as successful.
- The original attempt3 and partial recovery receipt SHA chains match exactly. Acceptance at13:22:00.586 UTC passed all9 checks.

Evidence SHA-256:

- `source-service-recovery-continuation.json`: `6ed46dfce03b10a81b989f751c0499dfd138665da361b4842c794fedbcf8c953`.
- `production-recovered-source.json`: `622d72fbebbc2b7826079fb98c320bfbfcc33df25b106f466be85bf3b9a4e16a`.
- `source-recovery-acceptance.json`: `50f66774954b0572d930793da4cef1ee5734c136dc0d402c73bb550e24f94c4e`.
- `source-recovery-terminal-receipts.json`: `c1fb31a6d34d3bd39c1405fc74408b14dbcafde39637621033707ac27c77d72c`.

This proves restoration of the original compatible source, not deployment of targetd107/runtime3.5.8/native13/product48. Authenticated business smoke remains explicitly unrun because an existing authorized cookie/company identity was unavailable. No new credential was created or copied.

## Scoped configuration restoration

The proposed configuration-only operation requires completed source recovery and passed acceptance, current four original source containers healthy, expected pinned f56/main/reclone configuration, and idle app/procedure action state. It writes only `commit` back to the baseline5d00ad7e379d82ea8b5ab35c10af775b155717f2 and `reclone=false`, with full before/after configuration equality except those two fields. Timeout leads to readback, not a duplicate write; non-success/mismatch stops. It verifies the same four healthy containers remain unchanged afterward.

Independent `git show` checks confirmed both app Compose manifests at5d00 pin sourceac9069460e99a20fac7f2c3de87c60f2bec66924. Thus the baseline pin matches the recovered356/native12 source instead of leaving the prepared native13 target configured. No deploy/start/migration, image publication, credential, security, environment, repository or branch write is included. Actual configuration restoration still requires the executor's resulting receipt; this static review does not claim that operation has completed.
