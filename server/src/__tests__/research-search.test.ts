import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

// Failure cases: ads/AI/aggregators, unsafe URLs, duplicates, changed markup,
// challenges disguised as HTTP 200, empty results, runaway paging and cancellation.
let pages: Array<string | Error> = []
const requests: string[] = []
mock.module('../modules/research/fetch.js', { namedExports: {
  fetchResearch: async (url: string, signal?: AbortSignal) => {
    signal?.throwIfAborted()
    requests.push(url)
    const page = pages.shift()
    if (page instanceof Error) throw page
    assert.equal(typeof page, 'string', 'unexpected extra search request')
    return { url, contentType: 'text/html', body: Buffer.from(page!) }
  },
} })
const { parse360Search, searchResearch } = await import('../modules/research/search.js')
const row = (url: string, title = '资料', extra = '') => `<li class="res-list" ${extra}><h3 class="res-title"><a href="https://www.so.com/link?m=opaque" data-mdurl="${url}">${title}</a></h3><p class="res-desc">真实 <b>摘要</b></p></li>`
const page = (rows: string) => `<html><title>查询_360搜索</title><ul id="m-result">${rows}</ul></html>`

test('natural results use original safe URLs, normalized text and stable deduplication', () => {
  const html = page([
    row('https://www.gov.cn/article#one', '<em>中文</em> 标题'), row('https://www.gov.cn/article#two'),
    row('https://example.org/doc', '国外资源仍允许'), row('https://ads.example.com/', '广告', 'data-is-ad="1"'),
    row('https://ai.so.com/search/answer'), row('https://wenku.so.com/s?q=search'),
    row('https://tv.360kan.com/s?q=search'), row('javascript:alert(1)'), row('http://127.0.0.1/'),
    row('https://user:pass@example.com/'), row('https://www.so.com/link?m=opaque'),
  ].join(''))
  assert.deepEqual(parse360Search(html), [
    { title: '中文 标题', url: 'https://www.gov.cn/article', snippet: '真实 摘要', source: '360搜索' },
    { title: '国外资源仍允许', url: 'https://example.org/doc', snippet: '真实 摘要', source: '360搜索' },
  ])
  assert.deepEqual(parse360Search(page(row('https://ai.so.com/search/a'))), [])
})

test('only explicit no-match pages are empty; challenges and broken markup fail', () => {
  assert.deepEqual(parse360Search('<html><title>查询_360搜索</title><div id="m-result">抱歉，没有找到相关结果</div></html>'), [])
  for (const html of ['', '<title>360搜索</title>', '<title>访问验证</title>', '<title>360搜索</title><form id="captcha"></form>', page('<li class="res-list"><h3>changed structure</h3></li>')]) {
    assert.throws(() => parse360Search(html), /search/i)
  }
})

test('result thumbnails preserve lazy image URLs without treating favicons or unsafe URLs as previews', () => {
  const withImage = (image: string) => page(row('https://www.gov.cn/article').replace('</li>', `${image}</li>`))
  const result = { title: '资料', url: 'https://www.gov.cn/article', snippet: '真实 摘要', source: '360搜索' }
  assert.deepEqual(parse360Search(withImage('<img class="g-img so-lazyimg" src="data:image/gif;base64,placeholder" data-isrc="//so.360tres.com/photo.jpg">')),
    [{ ...result, image: 'https://so.360tres.com/photo.jpg' }])
  assert.deepEqual(parse360Search(withImage('<img class="g-img" src="https://www.gov.cn/photo.jpg">')),
    [{ ...result, image: 'https://www.gov.cn/photo.jpg' }])
  for (const image of ['<img class="favicon_img" src="https://www.gov.cn/favicon.png">',
    '<img class="g-img" src="javascript:alert(1)">', '<img class="g-img" src="http://127.0.0.1/private">',
    '<img class="g-img" src="https://user:secret@example.com/photo.jpg">']) {
    assert.deepEqual(parse360Search(withImage(image)), [result])
  }
})

test('search stays within two pages, preserves order, validates inputs and propagates failures', async () => {
  pages = [page(row('https://www.gov.cn/one')), page(row('https://www.gov.cn/one') + row('https://www.gov.cn/two'))]
  requests.length = 0
  const result = await searchResearch('中文 query', 8)
  assert.deepEqual(result, { provider: '360搜索', query: '中文 query', results: [
    { title: '资料', url: 'https://www.gov.cn/one', snippet: '真实 摘要', source: '360搜索' },
    { title: '资料', url: 'https://www.gov.cn/two', snippet: '真实 摘要', source: '360搜索' },
  ] })
  assert.deepEqual(requests.map(raw => { const url = new URL(raw); return [url.origin, url.searchParams.get('q'), url.searchParams.get('pn')] }),
    [['https://www.so.com', '中文 query', '1'], ['https://www.so.com', '中文 query', '2']])
  pages = [page(row('https://www.gov.cn/one'))]
  requests.length = 0
  assert.equal((await searchResearch('测试', 1)).results.length, 1)
  assert.equal(requests.length, 1)
  for (const [query, limit] of [['', 8], ['a', 0], ['a', 21], ['a', 1.5]] as const) await assert.rejects(searchResearch(query, limit))
  for (const error of [new Error('research request timed out'), new Error('HTTP 429')]) {
    pages = [error]
    await assert.rejects(searchResearch('查询'), error)
  }
  await assert.rejects(searchResearch('查询', 8, AbortSignal.abort(new Error('cancelled'))), /cancelled/)
})

test('result payload stays below the native runtime 8000-character tool output limit', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => row(`https://example.org/${i}/${'long'.repeat(150)}`, '标题'.repeat(100))).join('')
  pages = [page(rows), page(rows)]
  const result = await searchResearch('查询'.repeat(500), 20)
  assert.ok(result.results.length > 0)
  assert.ok(JSON.stringify(result).length < 8000)
})
