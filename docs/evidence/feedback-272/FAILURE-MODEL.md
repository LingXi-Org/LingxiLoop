# Failure model before implementation

- A complete 35,718-character skill exceeds the published runtime's 8,000-character tool envelope. The existing host then requires 4,000-character reads, one response per model turn; wrappers escape text again. Document loading becomes a chain of model calls before any useful subject explanation.
- Retrying an already consumed range or treating EOF as a new cursor causes redundant calls. An oversized range may itself truncate. A failed read must never be mistaken for complete content.
- The unchanged upstream body asks for silence and reloading after compaction; host precedence must explicitly adapt those two instructions to public ReAct text and a complete current prompt.
- Inlining only a preview would omit constraints. Unbounded trusted content would crowd out the request. A stale compiled prompt could retain old content or permissions.
- Preloading must not grant tools or activate delivery. Save/activate and final verification remain required. Tool descriptions must not continue forcing a redundant load.
- A tool failure or an accidentally truncated reread should not erase the complete skill already supplied in the current authorized prompt. Other missing reference content must not be invented.
- Synthetic provider timings measure the local test path, not production/model latency. Reading-status prose is not substantive text. No production content is used.

Smallest checks: public prompt assembly for full content/bounds/authorization/version invalidation, and a real published worker plus local HTTP provider for substantive public SSE before tool completion, save/read/final delivery and redundant-load failure fallback. Exercise native observation truncation/repeat/EOF behavior as compatibility evidence, not a claim that a deterministic provider proves natural model compliance.
