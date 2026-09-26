import { load } from 'cheerio'
import { decodeSourceText } from '@lyyzka/lingxios'
import { researchUrl } from './address.js'
import { fetchResearch } from './fetch.js'

export interface ResearchSearchResult {
  title: string
  url: string
  snippet: string
  source: '360搜索'
  image?: string
}

export function parse360Search(html: string): ResearchSearchResult[] {
  // ponytail: public HTML avoids a search service; update selectors when 360 changes its markup.
  const $ = load(html)
  if (/^(?:访问|安全|人机)验证/.test($('title').text().trim()) || $('form#captcha, input[name="captcha"]').length) {
    throw new Error('research search requires verification')
  }
  $('script, style, noscript').remove()
  const links = $('li.res-list h3.res-title a')
  if (!links.length) {
    const empty = $('#main, #m-result, .result-none, .no-result').text()
    if ($('title').text().includes('360搜索') && /(?:没有找到|未找到|找不到)(?:与.{0,200}?相关的?)?(?:相关)?(?:结果|网页)|没有找到相关结果/.test(empty)) return []
    throw new Error('research search returned unrecognized results')
  }
  const results = new Map<string, ResearchSearchResult>()
  links.each((_index, element) => {
    const link = $(element), row = link.closest('li.res-list')
    if (row.is('[data-is-ad="1"], [data-ad="true"], .ad, .e-ad, .spread')
      || row.find('.ad, .e-ad, [data-is-ad="1"]').length
      || /^(广告|推广)$/.test(row.find('.e-tag').text().trim())) return
    const title = link.text().replace(/\s+/g, ' ').trim().slice(0, 160)
    const raw = link.attr('data-mdurl') || link.attr('href')
    if (!title || !raw) return
    let url: URL
    try { url = researchUrl(new URL(raw, 'https://www.so.com').href) } catch { return }
    const host = url.hostname.toLowerCase()
    if (host === 'ai.so.com' || host.endsWith('.ai.so.com')
      || ((host === 'so.com' || host.endsWith('.so.com') || host === 'tv.360kan.com') && /^\/(?:s|link|search)(?:\/|$)/.test(url.pathname))) return
    url.hash = ''
    if (results.has(url.href)) return
    const snippet = row.find('.res-desc, .res-list-summary').first().text().replace(/\s+/g, ' ').trim().slice(0, 300)
    const thumbnail = row.find('img.g-img, .res-img img').first()
    const imageUrl = thumbnail.attr('data-isrc') || thumbnail.attr('data-src') || thumbnail.attr('src')
    let image: string | undefined
    if (imageUrl) {
      try { image = researchUrl(new URL(imageUrl, 'https://www.so.com').href).href } catch { /* Invalid thumbnails do not discard a valid source. */ }
    }
    results.set(url.href, { title, url: url.href, snippet, source: '360搜索', ...(image ? { image } : {}) })
  })
  return [...results.values()]
}

export async function searchResearch(query: string, limit = 8, signal?: AbortSignal) {
  if (typeof query !== 'string' || !query.trim() || query.length > 2000) throw new Error('research query must contain 1..2000 characters')
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('research limit must be an integer from 1 to 20')
  const output = { provider: '360搜索' as const, query, results: [] as ResearchSearchResult[] }
  const seen = new Set<string>()
  // Native host events cap serialized results at 8000 characters. Keep whole
  // source records below that cap so replay never receives a truncated preview.
  if (JSON.stringify(output).length > 7800) throw new Error('research query exceeds serialized output limit')
  for (let page = 1; page <= 2 && output.results.length < limit; page++) {
    signal?.throwIfAborted()
    const endpoint = new URL('https://www.so.com/s')
    endpoint.search = new URLSearchParams({ q: query, pn: String(page) }).toString()
    const response = await fetchResearch(endpoint.href, signal)
    if (new URL(response.url).hostname !== 'www.so.com' || new URL(response.url).pathname !== '/s'
      || !['text/html', 'application/xhtml+xml'].includes(response.contentType)) throw new Error('research search returned an unexpected response')
    const results = parse360Search(decodeSourceText(response.body))
    for (const item of results) {
      if (seen.has(item.url)) continue
      seen.add(item.url)
      output.results.push(item)
      if (JSON.stringify(output).length > 7800) output.results.pop()
      if (output.results.length === limit) break
    }
    if (!results.length) break
  }
  return output
}
