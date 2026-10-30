import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { useZCodeIntl } from './IntlProvider'

function setLanguages(t: TestContext, documentLanguage: string | undefined, browserLanguage?: string) {
  for (const [key, value] of [
    ['document', documentLanguage === undefined ? undefined : { documentElement: { lang: documentLanguage } }],
    ['navigator', browserLanguage === undefined ? undefined : { language: browserLanguage }],
  ] as const) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, value })
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original)
      else Reflect.deleteProperty(globalThis, key)
    })
  }
}

test('Chinese product language overrides an English browser', (t) => {
  setLanguages(t, 'zh-CN', 'en-US')
  assert.equal(useZCodeIntl().intl.formatMessage({ id: 'genUi.title' }), '交互视图')
})

test('English document language overrides a Chinese browser', (t) => {
  setLanguages(t, 'en-US', 'zh-CN')
  assert.equal(useZCodeIntl().intl.formatMessage({ id: 'genUi.title' }), 'Interactive view')
})

test('an unset document language falls back to the browser language', (t) => {
  setLanguages(t, '', 'en-GB')
  assert.equal(useZCodeIntl().intl.formatMessage({ id: 'genUi.title' }), 'Interactive view')
})

test('without browser globals the default remains Chinese and missing messages retain their id', (t) => {
  setLanguages(t, undefined)
  const { intl } = useZCodeIntl()
  assert.equal(intl.formatMessage({ id: 'genUi.title' }), '交互视图')
  assert.equal(intl.formatMessage({ id: 'missing.message' }), 'missing.message')
})

test('loading labels describe generation, delivery and document loading in both locales', async (t) => {
  for (const [language, expected] of [
    ['zh-CN', ['正在生成交互视图…', '正在等待交互视图交付…', '正在加载交互视图…']],
    ['en-US', ['Generating interactive view…', 'Waiting for interactive view delivery…', 'Loading interactive view…']],
  ] as const) await t.test(language, (t) => {
    setLanguages(t, language, 'en-US')
    const { intl } = useZCodeIntl()
    assert.deepEqual(['genUi.waiting', 'genUi.awaitingDelivery', 'genUi.loading'].map(id => intl.formatMessage({ id })), expected)
  })
})
