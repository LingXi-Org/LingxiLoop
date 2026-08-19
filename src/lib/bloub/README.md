# Bloub engine

The framework-free animation engine in this directory is vendored from
[jeremy-prt/bloub](https://github.com/jeremy-prt/bloub) at commit
`b4bb3c1b5f93c7b87a2e8d620f667c4093d97749`. The ported geometry files remain
independent from React. `clock.ts` is LingxiLoop's shared scheduling adapter;
the native React SVG renderer lives in `src/components/BloubAvatar.tsx`.

Upstream license: MIT, Copyright (c) 2026 Jérémy Perret. The complete license
text is preserved in the repository-level `THIRD_PARTY_NOTICES.md`.
