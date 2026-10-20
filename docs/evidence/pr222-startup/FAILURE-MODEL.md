# Packaged startup failure model (before implementation)

Baseline: main 0a7fd57cca2e4d203a217a27f95882af5e3d2fd5, including PR222 a944de96.

- A shared browser helper imported by the server gains a runtime dependency, but the final Docker stage copies only its previous dependency graph. Repository tests and SPA build see files that the final image lacks.
- Extensionless shared imports work through the development resolver but obscure which runtime file must be packaged. Use the existing server-compatible `.js` source-import convention (tsx resolves it to TypeScript); bare Node TypeScript execution is not the checked-in production command.
- A server-source-only change may publish the server image without scheduling the existing deploy-contract import-graph check.
- A source import check can pass while Docker COPY still omits a file. Check the actual final package, with no source-tree fallback.
- Startup smoke must stop at the existing mandatory environment validation boundary, before DB, Redis, provider, or real credentials are required; it must reject module/linker errors, timeout, or an unexpected exit.

Red cases: bare Node import of baseline mentions; actual production tsx Web/Worker startup against a directory containing only final-stage copied source. Green cases: same packaged entrypoints and shared mention behavior, plus owning import-graph/CI routing guards. A build-time smoke inside the final image ensures the published package itself reaches the environment boundary.
