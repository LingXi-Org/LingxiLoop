import assert from 'node:assert/strict'
import test from 'node:test'
import type { TurnContext } from '@lyyzka/lingxios'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'

test('product policy requires answer wording instead of source labels and preserves Markdown examples', () => {
  const evidence = [{ marker: 'S1', sourceId: 'source-a', sourceVersion: 'v1', chunkId: 'c', title: '学习指南', excerpt: '复习应间隔进行。' }]
  const context = { evidence } as TurnContext, policy = new ProductRuntimePolicy()
  for (const body of ['结论[【S1】](#cite-S1)', '[S1](#cite-S1)', '[1](#cite-S1)', '[来源](#cite-S1)',
    '[**学习**指南](#cite-S1)', '[《学习指南》](#cite-S1)', '[source-a](#cite-S1)', '结论【S1】', '结论[S1]', '结论【**S1**】']) {
    assert.match(policy.validateAssistantText(body, context) ?? '', /supported answer wording/, body)
  }
  for (const body of ['普通说明。', '建议[**间隔**复习](#cite-S1)，并[主动回忆](#cite-S1)。',
    '- [通过 `retrieval` 巩固记忆](#cite-S1)\n\n| 建议 |\n| --- |\n| [间隔复习](#cite-S1) |',
    '`[【S1】](#cite-S1)`\n\n```md\n[来源](#cite-S1)\n【S1】\n```', '[学习指南](https://example.com)']) {
    assert.equal(policy.validateAssistantText(body, context), null, body)
  }
  assert.ok(policy.validateAssistantText('[有效说明](#cite-S1)[来源](#cite-S1)', context))
})
