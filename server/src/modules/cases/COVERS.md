# Case covers

Cases render a local text cover from `coverText` and one of six `coverColor` values. Missing metadata uses the title and blue palette. Draft metadata becomes public only with the existing publish snapshot.

The former model generation, queue worker, retry routes, asset endpoints and browser VM are retired. Existing cover tables and object data remain intact; no migration deletes them. Old open browser tabs should refresh to use the new renderer.

`0062_case_options` adds organization-scoped categories and colleges. Deploy requires already-installed formal3.8.24/product61, applies only this additive migration, then verifies a second no-op. Once62 is applied, fix forward with a62-compatible commit; exact61 releases reject the new ledger and cannot be used as a rollback.
