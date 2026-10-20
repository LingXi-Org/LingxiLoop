# Final browser fixture setup

The first official-engine attempt executed no tests because the default browser
cache directory did not exist. The existing approved cache is
`XDG_CACHE_HOME=/workspace/.cache`; no browser was installed or security setting changed.

With that cache, the first full final combination run passed36/38. Both failures
have concrete fixture evidence:

- Vite logged a newly optimized `@lyyzka/lingxios/ui` dependency and forced a page
  reload during the public-receipt timing measurement. The browser reported
  `Execution context was destroyed`.
- The private dependency graft still pointed KaTeX at another worktree. Vite
  rejected its real font paths outside the serving root; the font-load test
  reported a network error.

For the successful38/38 rerun, the fixture was stopped to prebundle the public runtime UI through
a test-only config and use a fresh private cache under this checkout's
`node_modules`. The exact existing KaTeX package was copied into this checkout,
verifying all225 file hashes. The old symlink was preserved without changing its
target. Only this checkout's native-fixture cache symlink was replaced with an
owned cache directory. Vite's file-serving allowlist, installed package content,
shared dependencies, production Vite config and browser assertions/budgets were
unchanged. Both original failed runs and logs are retained.

These checks use the actual product components with synthetic fixtures through
the official `e2e` / `@e2e-dev/web` engine. They do not establish official-site
live comparison, native operating-system reduced motion, real clipboard or
hardware-touch acceptance.
