# Failure model written before implementation

- Web, Worker, native auxiliary calls, local defaults, evaluation candidate or resource sync retain different chat defaults.
- A provider-specific model silently falls back to another ID or to the OpenAI origin.
- The requested Pro embedding is charged as the free ordinary model, or CNY/K is mistaken for USD/M.
- Missing/invalid FX is accepted in production; old model records are relabelled or repriced during reads.
- DeepSeek is billed with GLM tariffs; a rate selected for admission is mistaken for an invoice.
- Night tariffs are selected using the server's local timezone or a historical record's read time.
- BGE receives unsupported dimension reduction; a different embedding model shares an existing index without the model contract being checked.
- Independent rerankers are inadvertently changed.
- A template-only change is falsely reported as effective production configuration, or a GitHub action routes around the production access denial.

Regression scope: exact new model IDs and rendered templates; measured-token CNY/USD conversion and tariff boundaries; memory model/dimension contract; existing ledger regressions. No production calls, real index rebuild, or historical data rewrite.
