import assert from 'node:assert/strict'
import test from 'node:test'
import { installEditorTemplates } from '../third_party/baoyu-design/slides-source/modules/editor-templates.js'

test('new slide templates create Chinese placeholder text', () => {
  const runtime = new Proxy({
    createModelId: () => 'id',
    formatMessage: message => message.defaultMessage,
    untranslatedMessage: message => message,
    toModuleNamespace: value => value,
  }, { get: (target, key) => key in target ? target[key] : () => ({}) })
  installEditorTemplates(runtime)()
  const templates = Object.fromEntries(runtime.SLIDE_TEMPLATES.map(template => [template.id, template.make()]))
  assert.equal(templates['title-body'].frames[0].node.text, '标题')
  assert.deepEqual(templates['table'].frames[1].node.rows[0], ['项目', '状态', '负责人'])
  assert.deepEqual(templates['two-col'].frames.slice(1).map(frame => frame.node.children[0].text), ['左栏', '右栏'])
})
