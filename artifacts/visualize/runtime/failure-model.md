# Visualize runtime failure model (recorded before implementation)

- Skill body/resource text changes, truncation, or missing references prevent faithful generation.
- Model sees unavailable tools, or ordinary turns cannot access visualize while internal/teacher runs gain unintended capabilities.
- Tool accepts arbitrary filesystem paths, cross-tenant/project/channel references, symlinks or expired original-human authority.
- Saved fragments are not real files in the advertised authorized output directory; PG authority differs from executor content.
- Fragment size/document markup invalid; model invents a reference without successfully persisting its source.
- Streaming or failed responses mount incomplete HTML; references in fenced examples get treated as active content; citation offsets intersect reference syntax.
- Retries overwrite newer sources or bypass existing native lease/idempotency protections.
- Model reads private widget state rather than only modelContent; state content changes authorization or recipients.
- Export simulates render.py, permits arbitrary process arguments/paths, loses offline libraries, or advertises an artifact before createArtifact succeeds.
- Retiring OpenUI accidentally removes questionnaire admission, case sources, canvas verification, memory handling, shared LLM ledger, or signed ingress.

Validation: affected integration through existing test:integration entrypoint; real provider and official tester-army browser evidence coordinated with e2e owner; server:typecheck against exact published 3.5.3. No direct Playwright and no deployment.

## Published tool output truncation discovered by the real provider attempt

`@lyyzka/lingxios@3.5.3` bounds model tool outputs at 8,000 characters. The unchanged skill is 35,734 UTF-8 bytes. Loading it once can return a preview, so a successful skill action alone does not establish complete model access. The failed/stopped attempt is preserved in `live-incomplete-skill.json` (four measured calls; no successful end-to-end claim).

The adapter grants only the published `observations.read` action. Its existing implementation rechecks work, tenant, principal, agent, session, thread, request version, original tool contract, current source authorization and SHA-256. The host instructs one 2,000-character range per response until `next` is null. The owning worker fixture reconstructs all ranges and compares the full body exactly; the live fixture independently reconstructs public tool-event ranges, checks original skill/API/styles content, and records the skill hash before launching browser acceptance.
