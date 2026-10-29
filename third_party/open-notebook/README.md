# LingxiLoop Open Notebook RAG fork

This vendored MIT-licensed fork builds only the `lingxiloop-rag` image. The
root LingxiLoop workflow owns releases. SurrealDB runs as a separate service.

The supported surface is Notebook provisioning, Source extraction, scoped
Source search, the native-v1 Surreal schema and private R2 reads. Product
authorization remains in LingxiLoop; RAG scope-isolation tests remain here.

```sh
make build
make test
```

Tests use explicit fixtures rather than developer credentials. The shadow
migration integration tests require their separately configured SurrealDB
fixture; skipped tests are not verified.

The unused upstream UI, chat, podcast, model-management code and their optional
Python dependency groups have been removed. [UPSTREAM.md](UPSTREAM.md) records
the audited upstream commit and where to recover the retired source.
[LICENSE](LICENSE) retains the upstream MIT attribution. Historical migrations
remain reference material; the RAG service runs its own supported lifecycle.
