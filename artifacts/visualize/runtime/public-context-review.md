# Published 3.5.3 context extension review

This is a read-only API review; no alternative context adapter was implemented.

The published `ContextProvider.loadContext(work, signal, options)` can return `dynamic`, `productRules`, current authoritative `grants`, and the usual persona/messages. `RuntimePolicy.dynamicContextItems(TurnContext)` can render dynamic model items after session history. The public `TurnContext` includes `session`, `executionSteps`, `harness` and current grants. The worker reloads live context between model hops. These are legitimate public surfaces for carrying an authorized immutable skill body without the tool-output serialization bound.

However, `ContextProvider` receives no explicit successful-skill-load notification. `HarnessContext.skills` contains skill indexes, not a list of loaded full bodies. Eagerly carrying the entire visualize body would add its token cost to every authorized conversation. A lazy implementation would need an independently tested proof from trusted public execution/session records that the exact name/version/hash was successfully loaded, plus current capability reauthorization; a model claim or an available grant is insufficient. Parsing arbitrary Python source or using private ledger/runtime imports is not an acceptable shortcut.

The current implementation therefore uses only the existing public `skills.load` and `observations.read` flow. It reads one 4,000-character range per response, retries at 2,000 only if needed, and checks the full reconstructed body against the pinned skill. The owning fixture measured a maximum serialized range response of 4,696 characters, below the published 8,000-character output bound.
