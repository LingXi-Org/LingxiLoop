import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('knowledge mutations use the native approval boundary', () => {
  const source = readFileSync(new URL('../agent-os/learning-actions.ts', import.meta.url), 'utf8')
  for (const action of [
    'knowledge.update_source', 'knowledge.set_source_enabled', 'knowledge.unlink_source',
    'knowledge.delete_source', 'knowledge.update_note', 'knowledge.delete_note', 'knowledge.update_insight', 'knowledge.delete_insight',
  ]) assert.match(source, new RegExp(`['"]${action.replace('.', '\\.')}['"]`))
  const approvalBlock = source.slice(source.indexOf('const APPROVAL_REQUIRED'), source.indexOf('function record'))
  for (const action of ['knowledge.search', 'knowledge.add_text', 'knowledge.create_note']) {
    assert.doesNotMatch(approvalBlock, new RegExp(action.replace('.', '\\.')))
  }
})

test('IPython knowledge results are projected to local IDs', () => {
  const source = readFileSync(new URL('../knowledge/agent-knowledge.ts', import.meta.url), 'utf8')
  assert.match(source, /map\(agentSourceView\)/)
  assert.match(source, /return \{ status: result\.status, sourceId \}/)
  assert.match(source, /return \{ answer: result\.answer \}/)
  assert.doesNotMatch(source, /return localSources\(work, projectId\)/)
  assert.doesNotMatch(source, /return openNotebookClient\.createInsight/)
})
