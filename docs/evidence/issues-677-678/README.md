# Attachment uploads and consistent material reads (#677 / #678, related #633)

## Scope and source

Initial base main: `8cc00fd8`; rebased without conflict onto `fdcba93f` (#685 native qualification), preserving that owner's changes. Read #633, #677 and #678 with all comments and the current open PR list before editing. #637 is already merged and its independent text/vector settlement is retained. No competing #677/#678 PR was found. The large open #672 Visualize retirement remains independent; #635 teacher constraints are not modified. This contributor only creates a draft candidate; the parent-designated sole integrator owns review, merge and production release.

The original test ZIPs/material D are not present in this task. Development does not wait for those files, but synthetic fixtures are not described as the original evidence. The native file input has no application-configured default temporary directory; the reported missing picker directory is not claimed reproduced or repaired.

## Reproduced defects and final behavior

1. The installed AWS SDK signs a body-less PutObject with the CRC32 of empty content (`AAAAAA==`). A later nonempty browser PUT cannot satisfy that checksum. The native signing regression failed before the fix. A dedicated signing client now avoids generating a checksum for nonexistent bytes; modern upload requests instead explicitly bind the actual file SHA256, byte length and content type. The ordinary server-side storage client/checksums are unchanged. Existing credentials, bucket policy, CORS, authentication and permissions are unchanged; SHA travels in the signed query, with the browser's existing Content-Type header.
2. Browser empty/generic MIME and Python/Office aliases were treated as unsupported or stored as ZIP. A small shared normalizer maps known allowed filename/alias combinations to existing canonical formats: Python as text, PNG/PDF/DOCX as their real formats. Unknown executable/generic types remain rejected. Stored legacy DOCX-as-ZIP is normalized only for parsing after the existing ownership/committed-MIME checks; it is never relabelled in storage or an index. The real DOCX/ZIP-alias regression failed before this correction.
3. An upload retry generated another random storage object. The browser now retains a per-File, actor/company/authorization-epoch/document-scoped upload identity and actual SHA. Lost-signature and lost-PUT acknowledgements reuse that identity, and the server derives the same checksum-bound key. Existing uploaded_files registration accepts replay only for the same current owner/membership period/document. A changed payload/owner/document produces a different key. SHA-bound renewed signatures cannot overwrite a completed object with different bytes. Duplicate concurrent requests are coalesced; known completed uploads are reused. No raw files or signed URLs are persisted in browser storage. This does not claim raw File recovery after closing/reloading the page; saved submission references remain the existing durable owner.
4. Learner informational material reads used the strict publication validator, so one extraction failure prevented reading the complete material set. Informational reads now retain accessible same-hash good text and explicit failed/unsupported/empty/limit status plus closed error codes. The original raw-file hash and page sourceVersion remain available. Required-material publication, assessment/report gates, changed-file conflict, authorization and cancellation are unchanged. A failure never becomes a successful read or proof of mastery. The targeted purpose/status regression failed before the fix.
5. Upload errors expose safe stage codes and actionable messages for type/size, signing, interrupted transfer or rejected transfer. Raw signed URLs/storage response text never enter product copy. The native-only editor now offers the same retained-file retry action as the ordinary attachment editor.

The file hash uses WebCrypto SHA256, one bounded buffer at a time (existing 200 MiB upload ceiling). Course-source uploads share it and include the hash in their existing idempotency fingerprint/signing path. No schema migration, token creation, durable credential, source/index rebuild, model switch or irreversible deletion is added.

## Validation and limits

Local checks completed:

- Actual AWS presigner: explicit SHA256, signed size/type, and no empty-body CRC32; storage boundary regressions.
- Browser API mocks: Python/image MIME, lost signing/PUT acknowledgement, same key/hash on retry, completed upload reuse, authorization-epoch change before PUT, and rejected unsupported files; existing knowledge-upload identity regression.
- Real DOCX bytes from the existing public synthetic homework fixture: three repeated identical extractions and raw hashes, legacy ZIP MIME, retained malformed-DOCX failure with no private bytes in output, strict publication rejection, access refusal and abort propagation.
- Informational material purpose/version/safe error projection; frontend typecheck and changed-file Biome lint.
- Existing runtime/SPA source graph checks first found missing shared helper packaging; Docker COPY/context and owning CI filters now include it.

These local parser checks executed installed LingxiOS 3.8.21, while main pins formal 3.8.24. Normal package download and one reuse of the existing leecyang identity both returned npm HTTP401. No registry/credential/security changes, source dependency substitution or alternate private download were attempted. Local server typecheck therefore still reports missing formal24 APIs in unchanged model-timing files; it is not reported as passed. Final CI must install the exact locked formal3.8.24 and run server types/owning checks.

The new owning PostgreSQL/HTTP homework regression covers student `.py`, `.png`, PDF and DOCX presign/replay, exact bytes/hash, one registration per retry, saved answer, real submission snapshot, authorized teacher download, peer/other-course denial and revoked teacher access. It uses the existing isolated storage and scripted-model fixtures, not production R2 or paid model calls. This regression is pending execution in the exact-head CI; no local database integration success is claimed while the exact dependency is unavailable.

A normal sandboxed Chromium launch was attempted for browser verification and aborted before any page/assertion: the SUID sandbox helper is not correctly owned/configured (`/usr/lib/chromium/chrome-sandbox` owned by nobody). No `--no-sandbox`, helper modification or other security bypass was used. Zero native browser assertions/screenshots are claimed. The original T12/T15/T16/T20 flows and production R2 acceptance remain unverified; the candidate must not be described as their measured end-to-end success.

## Provider contracts

[AWS JavaScript checksum behavior](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/s3-checksums.html) documents default CRC32 since SDK3.729.0 and explicit precomputed checksums. [Cloudflare R2 release notes](https://developers.cloudflare.com/r2/platform/release-notes/) document S3 PutObject SHA256/SHA1 support (2025-07-03). This is a bounded single-PUT upload; no multipart FULL_OBJECT checksum type is requested. Live provider compatibility is still a production acceptance item, not inferred solely from documentation.

## #633 remains separate

The known active Pro/1024 generation and its original endpoint/seals are untouched. #637's text degradation is not repeated. Frontend `/internal/.../shadow/embeddings` remains denied: the previously proposed exception still requires specific approval and is not implemented by this task. No additional production observer, embedding/model call, token or index migration is run. Original run frozen budgets and exact rejection dimension remain unknown under the supported public SDK; no new inference is made.

The first candidate CI41848190109 passed server checks under the formal pinned dependency, but deploy-contract failed because `src/lib/uploadError.ts` was missing from the explicit server CI ownership filter. The filter is corrected; this failed run is retained and is not final-head success.
