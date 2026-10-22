# Public display contract failure model

Basis: product main d5481cd258058784e7004169b5ef1235460384f1 and the installed, published LingxiOS 3.8.2 public APIs. These are controlled synthetic cases, not observations of a private production run. Written before product changes.

1. A v2 sequence `commentary → tool → commentary → answer → accepted` changes the answer's logical display identity at commit, despite `AssistantMessage.publicTextPartId` and `PublicTextPart.acceptedResultId` naming the accepted source. Assert source identity continuity; different attempts, requests and result sources must remain distinct. No string comparison may choose a source.
2. A committed answer temporarily disappears between the accepted event and the message read, or accepted archived text becomes a second answer. Assert the handoff and archive retain exactly their intended roles, and immutable prefixes remain pageable.
3. Live or historical ordinary tools have no stable original order or changing revision, so offset pages reorder records or overwrite newer results/approval resolutions. Assert bounded annotation ordering/revisions and existing run/request/fence/lastSeq page identity.
4. An old resolved approval or successfully recovered failed tool stays outside as current attention. Assert explicit approval resolution and current outcome determine attention; unresolved current failures remain discoverable. Never claim a retry resolved a specific error without authoritative outcome evidence.
5. A rich card is assumed to be a deliverable merely because it has a renderer, or a real verified homework locator/native response presentation is folded into process. Assert only explicit validated result semantics produce result routing; unclassified historical parts retain visible fallback.
6. Public metadata admits arbitrary user strings, raw private tool input, or task parent relationships inferred from ordering/names. Assert bounded public identities and real trace relationships only; hidden reasoning and private tool values remain excluded.
7. Different document versions collapse into one citation source; require source+version identity while retaining precise chunk provenance.

The browser layer must independently verify real v2 fixture DOM continuity, single active interactions, history/live races, responsive themes, keyboard behavior and retained body visibility. Passing this projection suite alone does not constitute browser or production acceptance.
