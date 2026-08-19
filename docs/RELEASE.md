# LingxiLoop release guide

Desktop releases are owned and published by `LingXi-Org/LingxiLoop`. No tag or
workflow is allowed to dispatch into the upstream Cumora repositories.

## Desktop release

1. Bump the root `package.json` version and commit it to `main`.
2. Push a matching annotated tag, for example `v0.1.0-alpha`.
3. `.github/workflows/release.yml` builds macOS, Windows, and Linux artifacts
   and attaches them to the GitHub Release in this repository.

The Electron updater also reads releases from `LingXi-Org/LingxiLoop`, as
configured by `build.publish` in the root `package.json`.

Signed macOS production builds require the standard electron-builder Apple
signing/notarization secrets. Unsigned builds remain suitable for internal
compatibility testing.

## CLI publishing

`.github/workflows/publish.yml` is independent of desktop tags. It only runs
when `agent-cli/**` changes on `main`, and publishes the package name/version
declared by `agent-cli/package.json` when `NPM_TOKEN` is configured.

## Server deployment

Every push to `main` runs `.github/workflows/build.yml` and produces immutable
server images after type checks and tests pass. Deployment is a separate,
manually approved workflow; pushing a desktop tag never deploys the server.

The MVP server Docker image is standalone and contains no `kubectl`. Optional
Kubernetes deployments install and invoke cluster tooling in the deployment
workflow/runner, not while building or running the ordinary server image.
