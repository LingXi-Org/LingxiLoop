Runtime CSS from `shadcn@4.19.0`, `package/dist/tailwind.css` in the tarball
identified by root `package-lock.json`. The bytes are unchanged.

SHA-256: `bc7d83425702955b4cb67cb14ede9d603f9d912376d57a2d81d661094d2a782a`.

The MIT license is in `LICENSE.md`. This stylesheet is needed by Web and admin;
the CLI and its tool dependencies are only needed for full local development.
When upgrading the root CLI lock, extract the replacement stylesheet and license
from the integrity-verified tarball, then update this provenance and the guard in
`server/scripts/scoped-dependencies.mjs` and verify Web/admin builds.
