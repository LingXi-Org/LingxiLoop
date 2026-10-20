# Official source review

Pinned assistant-ui source: https://github.com/assistant-ui/assistant-ui/tree/5402b93a1e991d0a3e44e253d7bd67880931c835/packages/ui/src/components/react/assistant-ui/elements (MIT).
The exact source paths, SHA-256 and product module paths are in `upstream.json`; `ASSISTANT-UI-LICENSE` retains the license.

| Module | Source review / necessary product adaptation |
| --- | --- |
| RunActivity | Byte-identical official container. The application supplies classified native parts and places the latest durable public explanation in the existing attention slot; final answer and interactive attention remain separate. |
| Reasoning | Full official primitives; existing Chinese convenience wrapper and scroll locking retained. New `defaultOpen` forwards to the official root for the foreground explanation. |
| ToolCall | Full official structure, disclosures, request/result panels and transitions. Existing Chinese copy, focus ring and honest failed/pending outcome icon adaptation retained. No fabricated private arguments or result payload. |
| ToolGroup | **Official `tool-group.aui.tsx`**, locally named `tool-group-primitives.tsx`, with Chinese count. The small wrapper composes Root/Trigger/Content. This is the AUI primitive variant, not the separate `tool-group.tsx` visual demo. |
| ToolTimeline | Full official component; existing focus ring adaptation. |
| AgentPlan | Full official component, existing Chinese text/accessibility and paused state to avoid showing stopped work as running. |
| MemoryChips | Full original source and interaction; translated count/header and forget accessible name. Provider/query authorization and loading/empty/error lifecycle belong to the product adapter. |
| WebSearch | New direct integration of the complete original source. Chinese copy; actual source count replaces demo hardcoded count. Authorized source URLs become accessible links; URL-based keys distinguish results from one domain. Existing linked previews/citations remain. |
| ErrorState | Existing integration retains both original retry/error structures, icons, styles and callbacks; Chinese labels, responsive width, contrast, focus/disabled adaptations. |

No dependency internals, runtime protocol, transport decoder or clear/discard handler changed. Official Message primitives, ExternalStoreRuntime and Assistant Transport remain the message path.

The live official-site browser reference attempt failed with `net::ERR_CERT_AUTHORITY_INVALID`. No certificate or security setting was changed. Product screenshots are synthetic fixture evidence, not a substitute for the outstanding live official-site visual comparison.
