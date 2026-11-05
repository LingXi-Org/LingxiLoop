import { z } from 'zod'
import { agentArtifactSchemas } from './contracts.js'

/** Generated from the accepted operation schema so Agent guidance cannot drift from validation. */
export function nativeModelReference(kind: 'design' | 'slides') {
  return `# Native ${kind} model\n\n`
    + 'Document contains schemaVersion, id, kind, title, seq, themeId, themes, assets, pageOrder, pages and versions. '
    + 'read_document returns page, theme and asset summaries plus global versions; it omits original theme payloads and asset URLs. tokenPreview is partial and must not replace a full theme. read_page returns full nodes and scoped versions. Pass version=pageVersions[pageId] and atSeq=document.seq from the summary for a consistent snapshot, and combine the returned versions when preparing operations. Full theme data remains in project/document.json accessible through read_file. A Page has id/title, x/y/width/height, background, notes, skip, transition, nodeOrder and nodes. '
    + 'A Node always has id/type, x/y/width/height/rotation, parentId (null or group ID) and style. '
    + 'Types: text (text or richText), image (assetId/crop), shape (shape), line (points), table (cells), svg (validated inert svg), math (TeX source), group (layout), embed (isolated source). '
    + 'Executable source belongs only to an embed; legacy originals are immutable. IDs contain letters, digits, hyphen and underscore. A pageOrder/nodeOrder lists every corresponding ID exactly once.\n\n'
    + '## Versions\n\nUnconverted legacy summaries contain sourceVersion and no pageVersions. Pass that sourceVersion to read_page and apply_ops instead of atSeq; it checks the exact immutable original across conversion. Once converted, use native pageVersions/atSeq. Read field versions from the same snapshot; absent keys have version 0. Include only required keys, not every document version. '
    + 'For node.patch include page/PAGE/exists, node/PAGE/NODE/exists and node/PAGE/NODE/field/FIELD for each changed field. Style leaves use field/style.color etc. '
    + 'A text-only patch clears existing richText so the visible content changes; include field/richText as well as field/text. To retain formatting, patch richText and its plain-text representation together. '
    + 'For parentId also include page/PAGE/nodeOrder and the new parent existence key. '
    + 'For node.insert include page/PAGE/exists, node/PAGE/NEW_ID/exists, page/PAGE/nodeOrder and parent existence if non-null. '
    + 'For node.delete include page/PAGE/exists, page/PAGE/nodeOrder and both node/PAGE/ID and node/PAGE/ID/exists for the node and every descendant. '
    + 'For node.replace include page existence, node existence and node aggregate version; parent changes also require ordering/new parent existence. '
    + 'For page.patch include page/PAGE/exists and page/PAGE/field/FIELD. A background-only patch removes themeBackground, so also include page/PAGE/field/themeBackground. '
    + 'For page.insert include page/NEW_ID/exists and document/pageOrder. For page.delete include page/PAGE, page/PAGE/exists and document/pageOrder. '
    + 'pages.reorder uses document/pageOrder; nodes.reorder uses page/PAGE/exists and page/PAGE/nodeOrder. '
    + 'document.patch uses document/title or document/themeId; choosing a theme also requires theme/THEME_ID. Theme changes use theme/THEME_ID; deleting a theme also requires document/themeId. '
    + 'Asset changes use asset/ASSET_ID; asset.delete also requires asset/ASSET_ID/references. Inserting a page/node, replacing a node or changing assetId/embed.previewAssetId also requires asset/ASSET_ID for each referenced resource. '
    + 'Preconditions for a batch refer to its starting snapshot, including targets created earlier in the same batch.\n\n'
    + 'A successful batch returns its durable operationId and committedSeq. On conflict reread the conflicting targets and decide whether your intended change still applies; do not overwrite another author. '
    + 'read_document seq is informational for sequencing: an older baseSeq may still succeed if all touched target versions match.\n\n'
    + '## Accepted batch JSON schema\n\n```json\n' + JSON.stringify(z.toJSONSchema(agentArtifactSchemas.apply_ops, { reused: 'ref' })) + '\n```\n'
}
