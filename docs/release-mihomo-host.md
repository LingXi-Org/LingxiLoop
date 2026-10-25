# Inactive Mihomo host preinstallation

This is the finite preinstaller for the user-approved A/B native Mihomo preparation. It performs no production operation by itself. Only `query` and `install` exist; no start, enable, provider import, subscription download, Docker daemon/proxy/network/Git operation is present.

## Fixed interface and artifacts

The integrator may load `scripts/release/bootstrap-host/mihomo.py` into the existing bounded operator transport using `python3 -c <shell-quoted-source> <shell-quoted-JSON>`. JSON must contain exactly `{"action":"query","host":"a"}` or the corresponding `install` action and host `a`/`b`. No executable, URL, path, account identity, credential or shell command is accepted as data. Query is read-only and does not create the install root or acquire the writer lock. Install is serialized by its own nonblocking fixed lock and has a 120-second Linux wall-clock deadline covering download, extraction, version checks and promotion.

The only download URL is `https://release.lingxilearn.cn/v1/bootstrap/mihomo/v1.19.33/linux-amd64-compatible.gz`. It uses the existing root-owned private `/etc/lingxi-release/secrets/executor-token` as an in-memory Bearer header and rejects all redirects. Credentials are never passed in argv, input JSON, receipt, subprocess environment or diagnostics.

The compressed artifact must be exactly 22,893,972 bytes with SHA-256 `386508bfb1c72c43b6a0eda73708ecdce82546581b0ebcb16366c53757c622b6`. Gunzip streams into a staged file with a strict 128 MiB raw limit. The derived raw binary SHA-256 is recorded and used for every staged/installed comparison. The verified binary must succeed with the fixed `-v` argument and identify Mihomo `v1.19.33` before any user or final artifact is installed.

Fixed destinations:

- Binary: `/usr/local/bin/mihomo`, mode 0755.
- Unit: `/etc/systemd/system/lingxi-release-mihomo.service`, mode 0644.
- Immutable local policy: `/etc/lingxi-release/mihomo.yml`, mode 0600.
- Bootstrap ownership evidence and retained staging: `/opt/lingxi-release-mihomo`, mode 0700 on creation.
- Dedicated local service user/group: `lingxi-release-proxy`, no home creation, `/nonexistent` home, `/usr/sbin/nologin` shell and locked password.

The exact reviewed bytes from `deploy/release-host/lingxi-release-mihomo.service` and `mihomo.example.yml` are embedded in the module and checked against those repository files by a focused test. The corrected unit reads its fixed config using `-f %d/config.yaml` with `LoadCredential=config.yaml:/etc/lingxi-release/mihomo.yml`; the existing provider credential is a separate required file. Root/private configuration directories need no permission changes. The fixed policy listens only on `127.0.0.1:17890`; subscription content cannot replace it.

## Ownership, unknown outcomes and safe refusal

Before first installation, the final binary, unit, config, dedicated state directory, service user and service group must all be absent, and systemd must report the service inactive/not-found. Any pre-existing account or artifact without this installer's receipt/intent is a conflict, even if it looks compatible. This installer does not take over an unrelated Mihomo installation.

After full artifact verification, a durable `intent-v1.19.33.json` records host identity, compressed/raw hashes, fixed policy/unit hashes and an unpredictable non-authentication user ownership marker. Only then may user/file installation begin. `useradd --system --user-group` selects available system IDs; the module never guesses a numeric UID/GID. The requested local user has a unique GECOS ownership marker. Local passwd/group and NSS records must agree. After a crash, the user is accepted only when its marker, non-login shell, home, positive UID, matching primary GID and empty dedicated group membership match the pending own intent. An uncertain/foreign user or partial group causes safe refusal rather than account adoption or deletion.

Every staged and existing final artifact is hash-checked before continuation. File promotion uses same-directory temporary files and exclusive links, so cross-filesystem `/opt` to `/usr/local` works without replacing any existing destination. Final modes and the full actual user identity are checked before writing `install-v1.19.33.json`. A completed receipt is idempotent only for the original host, exact files/modes and recorded account identity. Original staging and the intent remain available for reconciliation; no automatic cleanup or destructive rollback is performed.

After an unknown result, query the original host and inspect its receipt/intent/current systemd state before deciding whether continuation is safe. Query verifies the original host, complete final hashes/modes and owned user for completed receipts; pending intents verify staged code/policy hashes. A missing receipt does not prove no user or file was created. A user created but not provably linked to an own intent is a blocker. Failed partial installation is never repaired by overwriting or deleting foreign resources.

The module does not create `/var/lib/lingxi-release-proxy`; the reviewed systemd StateDirectory setting owns its future creation after separate activation approval. It does not run daemon-reload, enable or start, create a provider file, request a subscription, change parent directory permissions, alter Docker daemon settings or restart Docker. Receipts explicitly retain `activationReady:false`, `serviceStarted:false`, `enabledByModule:false` and `providerProvisionedByModule:false`. The missing subscription/provider remains an activation blocker; a hash-verified preinstallation is not a working proxy claim.

## Verification and remaining live checks

`node --test scripts/release/bootstrap-host/mihomo.test.mjs` passes two Node tests containing eight Python actor cases: inactive idempotent installation; user/binary promotion crash and verified continuation; unowned binary/unit/config/user refusal; user ownership drift; compressed identity and bounded expansion rejection; installed hash/host drift; invalid actions and total deadline; exact authenticated URL and redirect refusal. The second Node test checks the embedded service/policy against the exact repository templates. Python syntax is also checked. Tests use temporary paths and mocked downloads, account creation and systemd; no production action was executed.

Live download, actual raw SHA, host package/system-user prerequisites, systemd inactive state and final filesystem/account identity remain for the sole production writer to verify. No provider or real proxy/network/registry check has been performed by this module.
