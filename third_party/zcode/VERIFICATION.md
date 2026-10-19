# Verification failure cases

The verification command must reject a missing or additional file in the immutable 24-file skill, any byte change, a symlink substituted for an upstream file, a different pinned revision, a missing source archive file, a mismatched runtime-manifest entry (including the out-of-directory Tweak runtime), a missing vendor script/license, and mismatched vendor hashes. A partial copy must not pass because its own freshly generated hashes match. The manifest records fixed upstream Git blob identities as well as SHA-256 and is checked against those identities.

Run `node scripts/verify-zcode-visualize.mjs` from the repository root. This is an integrity check, not visual, browser, authorization, or model E2E acceptance. Browser parity still requires the official tester-army engine, matching fixtures, fonts, viewport/DPR, theme, and rendering conditions.
