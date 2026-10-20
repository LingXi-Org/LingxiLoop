# Worker isolation: read-only diagnosis and bounded validation plan

Scope: documentation only. No container, security profile, capability, namespace setting, host setting, production service or credential was changed. No new image was pulled and no Worker was started for this diagnosis.

## Established facts and uncertainty

The release coordinator reports immutable base-source `535873b9` image Web startup, migration and 997 static-file checks passed, but the real Worker exited 1 at the bubblewrap namespace boundary. That is an unsuccessful Worker qualification; a database-environment import guard is not a substitute.

Product `server/src/agent-runtime/runtime.ts` explicitly selects bubblewrap in production. Before doctor and Worker start, it executes:

```text
bwrap --die-with-parent --unshare-all --new-session --ro-bind / / --proc /proc --dev /dev -- /usr/bin/true
```

Installed published LingxiOS 3.5.6 also runs its own isolated Python self-check (`dist/src/kernel/isolation.js`). Its sandbox construction uses separate namespaces and intentionally omits procfs to preserve the outer container's masked paths. The product preflight and the runtime's actual Python sandbox are different checks; both must pass. This PR changes neither.

Read-only inspection of this development environment found a local Unix Docker endpoint with the built-in seccomp profile and a seccomp-filtered agent process. The visible user-namespace count limit is nonzero. These observations concern this development environment, **not the coordinator's failed Worker process**, and do not identify the particular denied syscall or prove a kernel setting, Docker profile or LSM caused that failure. The older local retained image receipt stopped at image-pull disk protection before any application launch; it is not the coordinator's later successful Web/failed Worker receipt.

Upstream [bubblewrap documentation](https://github.com/containers/bubblewrap/blob/main/README.md) explains that namespace support and the caller's arguments define the sandbox. [Docker's seccomp documentation](https://docs.docker.com/engine/security/seccomp/) describes syscall filtering and namespace-related restrictions. These support checking the effective execution boundary; they do not establish a root cause for the reported run. The checked-in deployment configuration already differs from the local default Docker profile, so default-container failure cannot be silently promoted to a production-host diagnosis.

## Validation that preserves isolation

This is a plan for the release owner, not work executed or newly authorized here:

1. Select an existing, authorized, isolated non-production Linux validation runner whose **already approved** environment supports the required nested namespaces. Check free disk before retrieving an image. Use the final candidate's immutable image identity and recorded source/runtime/schema provenance. Do not use a mutable tag or claim the base image qualifies a different candidate.
2. Read the effective container security options, user/capability state, existing seccomp/LSM denial evidence, sanitized preflight stderr and exact failing stage. Keep addresses, infrastructure identities and configuration values in private operational evidence. This distinguishes the product preflight from the runtime Python self-check without changing either. Do not dump process environments, model data or credentials.
3. Use the existing approved isolated test service configuration with synthetic data and local service endpoints. Preserve production mode, bubblewrap selection, required namespaces, read-only mounts, resource limits, normal doctor checks and the actual `npm run worker:start` entrypoint. Do not add privileges, switch to process isolation, remove the preflight, disable seccomp/LSM, expand host mounts or alter host namespace settings to turn a red check green. If the approved environment still rejects the operation, retain the failure and stop that qualification.
4. Require the normal migration on the isolated fixture, Web readiness, actual Worker readiness, and the published runtime's isolation checks. In synthetic short probes, verify the kernel cannot read an out-of-home sentinel, cannot write a read-only host path, and has no forbidden outbound network access; verify allowed home I/O plus cancellation/deadline and child-process cleanup. Run the pinned runtime's existing isolation tests rather than weakening them or substituting an unsandboxed process. No provider credential or production resource is needed for these isolation probes.
5. Record image digest/source, approved configuration identity, step exits, readiness results, isolation-negative checks and fixture cleanup. A successful startup with skipped isolation checks remains a failure. Clean only the test's owned fixtures through the normal harness. If no suitable approved runner is available, report the qualification blocked by environment capability; pursue any proposed policy change separately under its own review and authority.

The safe immediate result is an explicitly open Worker qualification gate. This source-payload draft PR can be reviewed independently; it neither resolves nor bypasses that release gate.
