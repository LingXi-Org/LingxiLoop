# Combined UI release verification

The exact production combination at `5d0456373ef33d88d45955d1811a523796574425`
contains PR221, PR222 and PR220 (`11876700`), plus the test-only color-readiness
correction described in `../color-readiness`. Production files were unchanged.
The official runner exited 0: **35/35 local product tests, 9 files, 163.82s**.
It used e2e 0.17.0 / @e2e-dev/web 0.12.0 and the existing Vite fixture on 5214.

Coverage: 3 mention/scroll cases, 3 activity presentation, 5 activity regressions,
2 memory/privacy cards, 7 RunActivity, 4 streaming lifecycle, 3 whole-part tail,
7 streaming-text and 1 Visualize identity case. Original reports, JUnit,
screenshots, exact config and logs are retained below.

The prior full combination had 34/35 passing; its initial-blue sampling failure
is retained separately. The new case observes the blue precondition within the
original three-second deadline, then retains and strengthens the transition,
identity, whitespace, zero stable mutation, two-tail-token and one-caret assertions.
No production timing or timeout changed and no successful retry was substituted.
An earlier disk-full invocation remains at the integrator's
`artifacts/ui-release-combination-valid` and `/tmp/ui-release-combination-valid.log`;
it is an environment failure, not a test pass or inferred product regression.

Two official-site reference navigation cases were explicitly excluded by
`--grep-invert 'official reference'` because their separately retained normal-TLS
attempt failed with ERR_CERT_AUTHORITY_INVALID. No bypass was used. Native OS/CSS
reduced motion and live-provider latency remain unverified by this fixture.

Reproduction: serve the combined fixture with `E2E_STREAMING_FIXTURE=1`,
`E2E_MEMORY_PRIVACY_FIXTURE=1`, `E2E_ACTIVITY_FIXTURE=1`; set the same flags,
`E2E_PROJECT=web`, `E2E_TELEMETRY_DISABLED=1`, `E2E_BASE_URL=http://127.0.0.1:5214`,
and the installed official browser cache in the runner environment. Pass the
included config and the nine owning file/directory selections shown in the
root command receipt. The full command, source hashes and evidence hashes are
in `provenance.json`. The config should be copied to the repository root.
